import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
    StatusBar,
    RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { RootState } from '../store/store';
import { supabase } from '../lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Booking {
    id: string;
    seeker_id: string;
    service_category: string;
    price_per_hour: number;
    status: 'pending' | 'accepted' | 'declined' | 'in_progress' | 'completed' | 'cancelled';
    created_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Human-readable relative time: "3 min ago", "2 hrs ago", etc. */
function timeAgo(iso: string): string {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff <= 0) return 'just now';          // guard against future server timestamps
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
    return `${Math.floor(diff / 86400)} day ago`;
}

// ── Job Card ───────────────────────────────────────────────────────────────────

interface JobCardProps {
    job: Booking;
    onAccept: (id: string) => void;
    onDecline: (id: string) => void;
    actionLoading: string | null; // id of job currently being actioned
}

function JobCard({ job, onAccept, onDecline, actionLoading }: JobCardProps) {
    const busy = actionLoading === job.id;

    return (
        <View className="bg-brand-white rounded-2xl p-5 mb-3 mx-4 border border-brand-border">
            {/* Category + time */}
            <View className="flex-row items-center justify-between mb-3">
                <View className="bg-brand-navy rounded-full px-3 py-1">
                    <Text className="text-brand-white text-xs font-semibold">
                        {job.service_category}
                    </Text>
                </View>
                <Text className="text-text-secondary text-xs">{timeAgo(job.created_at)}</Text>
            </View>

            {/* Price */}
            <View className="flex-row items-baseline mb-4">
                <Text className="text-2xl font-bold text-text-primary">
                    {job.price_per_hour != null ? `₹${job.price_per_hour.toFixed(0)}` : 'Price on request'}
                </Text>
                {job.price_per_hour != null && (
                    <Text className="text-text-secondary text-sm ml-1">/ hr</Text>
                )}
            </View>

            {/* Action buttons */}
            {busy ? (
                <ActivityIndicator color="#0F172A" />
            ) : (
                <View className="flex-row gap-3">
                    <TouchableOpacity
                        className="flex-1 bg-brand-emerald rounded-xl py-3 items-center"
                        activeOpacity={0.85}
                        onPress={() => onAccept(job.id)}
                    >
                        <Text className="text-brand-white text-sm font-semibold">Accept</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        className="flex-1 border border-brand-border rounded-xl py-3 items-center"
                        activeOpacity={0.75}
                        onPress={() => onDecline(job.id)}
                    >
                        <Text className="text-text-secondary text-sm font-semibold">Decline</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function ProviderJobFeedScreen() {
    // userId from Redux session — avoids redundant getUser() calls on every fetch/refresh
    const session = useSelector((state: RootState) => state.auth.session);
    const userId = session?.user?.id ?? null;

    const [jobs, setJobs] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    // ── Fetch pending bookings ─────────────────────────────────────────────────

    const fetchJobs = useCallback(async (silent = false) => {
        if (!userId) return;
        if (!silent) setLoading(true);
        setError(null);

        try {
            const { data, error: dbError } = await supabase
                .from('bookings')
                .select('*')
                .eq('provider_id', userId)
                .eq('status', 'pending')
                .order('created_at', { ascending: false });

            if (dbError) throw new Error(dbError.message);
            setJobs((data as Booking[]) ?? []);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to load jobs.';
            setError(msg);
            if (__DEV__) console.warn('[ProviderJobFeed] fetchJobs:', msg);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [userId]);

    // ── Real-time subscription ─────────────────────────────────────────────────

    useEffect(() => {
        if (!userId) return;

        let isMounted = true;
        // Store channel ref so cleanup can always remove it regardless of mount timing
        let channel: ReturnType<typeof supabase.channel> | null = null;

        const init = async () => {
            await fetchJobs(false);

            if (!isMounted) return; // component unmounted during fetch — don't subscribe

            channel = supabase
                .channel(`bookings-provider-${userId}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'bookings',
                        filter: `provider_id=eq.${userId}`,
                    },
                    (payload) => {
                        if (!isMounted) return;
                        const newJob = payload.new as Booking;
                        setJobs(prev => [newJob, ...prev]);
                    }
                )
                .subscribe();
        };

        void init();

        return () => {
            isMounted = false;
            if (channel) void supabase.removeChannel(channel);
        };
    }, [userId, fetchJobs]);

    // ── Accept / Decline ──────────────────────────────────────────────────────

    const handleAction = useCallback(async (
        jobId: string,
        newStatus: 'accepted' | 'declined'
    ) => {
        if (actionLoading) return; // block concurrent actions

        setActionLoading(jobId);
        try {
            const { error: updateError } = await supabase
                .from('bookings')
                .update({ status: newStatus })
                .eq('id', jobId);

            if (updateError) throw new Error(updateError.message);

            // Optimistic removal — card disappears instantly
            setJobs(prev => prev.filter(j => j.id !== jobId));
        } catch (err) {
            if (__DEV__) console.warn('[ProviderJobFeed] handleAction:', err);
            // On failure: re-fetch to restore correct state
            await fetchJobs(true);
        } finally {
            setActionLoading(null);
        }
    }, [actionLoading, fetchJobs]);

    // ── Pull-to-refresh ───────────────────────────────────────────────────────

    const handleRefresh = useCallback(() => {
        setRefreshing(true);
        fetchJobs(true);
    }, [fetchJobs]);

    // ── Render ────────────────────────────────────────────────────────────────

    const renderEmpty = () => {
        if (loading) return null;
        return (
            <View className="flex-1 items-center justify-center px-8 mt-20">
                <Text className="text-4xl mb-4">📭</Text>
                <Text className="text-base font-semibold text-text-primary text-center mb-2">
                    No pending bookings
                </Text>
                <Text className="text-sm text-text-secondary text-center leading-5">
                    New booking requests will appear here in real-time.
                </Text>
            </View>
        );
    };

    return (
        <SafeAreaView className="flex-1 bg-brand-surface">
            <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

            {/* Header */}
            <View className="flex-row items-center justify-between px-4 pt-4 pb-3">
                <View>
                    <Text className="text-xl font-bold text-text-primary">Job Feed</Text>
                    <Text className="text-xs text-text-secondary mt-0.5">
                        {jobs.length > 0 ? `${jobs.length} pending request${jobs.length > 1 ? 's' : ''}` : 'Live updates enabled'}
                    </Text>
                </View>

                {/* Live indicator */}
                <View className="flex-row items-center">
                    <View className="w-2 h-2 rounded-full bg-brand-emerald mr-1.5" />
                    <Text className="text-xs text-text-secondary">Live</Text>
                </View>
            </View>

            {/* Error banner */}
            {error && (
                <View className="mx-4 mb-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <Text className="text-red-600 text-sm">{error}</Text>
                </View>
            )}

            {/* Loading */}
            {loading ? (
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" color="#0F172A" />
                    <Text className="text-text-secondary text-sm mt-3">Loading bookings…</Text>
                </View>
            ) : (
                <FlatList
                    data={jobs}
                    keyExtractor={item => item.id}
                    renderItem={({ item }) => (
                        <JobCard
                            job={item}
                            onAccept={id => handleAction(id, 'accepted')}
                            onDecline={id => handleAction(id, 'declined')}
                            actionLoading={actionLoading}
                        />
                    )}
                    ListEmptyComponent={renderEmpty}
                    contentContainerStyle={{ paddingTop: 8, paddingBottom: 32, flexGrow: 1 }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                            tintColor="#0F172A"
                        />
                    }
                />
            )}

            {/* Sign Out */}
            <TouchableOpacity
                className="items-center py-4 border-t border-brand-border"
                onPress={() => { void supabase.auth.signOut(); }}
                activeOpacity={0.7}
            >
                <Text className="text-text-secondary text-sm">Sign Out</Text>
            </TouchableOpacity>
        </SafeAreaView>
    );
}
