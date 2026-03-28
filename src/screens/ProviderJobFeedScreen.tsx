import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    SectionList,
    TouchableOpacity,
    ActivityIndicator,
    StatusBar,
    RefreshControl,
    Alert,
    Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { RootState } from '../store/store';
import { supabase } from '../lib/supabase';
import PinModal from '../components/PinModal';
import * as Location from 'expo-location';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Booking {
    id: string;
    seeker_id: string;
    service_category: string;
    price_per_hour: number | null;
    status: 'pending' | 'accepted' | 'declined' | 'in_progress' | 'completed' | 'cancelled';
    created_at: string;
    doorstep_pin: string | null;
    started_at: string | null;
    seeker: { display_name: string | null } | null;  // JOIN from profiles
}

// SectionList requires typed sections
interface Section {
    title: string;
    data: Booking[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff <= 0) return 'just now';
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
    return `${Math.floor(diff / 86400)} day ago`;
}

// ── Job Card ───────────────────────────────────────────────────────────────────

interface JobCardProps {
    job: Booking;
    onAccept?: (id: string) => void;
    onDecline?: (id: string) => void;
    onStartJob?: (job: Booking) => void;
    onCompleteJob?: (id: string) => void;
    actionLoading: string | null;
}

function JobCard({ job, onAccept, onDecline, onStartJob, onCompleteJob, actionLoading }: JobCardProps) {
    const busy = actionLoading === job.id;
    const seekerName = job.seeker?.display_name ?? 'Customer';
    const isAccepted = job.status === 'accepted';
    const isInProgress = job.status === 'in_progress';

    return (
        <View className="bg-brand-white rounded-2xl p-5 mb-3 mx-4 border border-brand-border">
            {/* Category + time */}
            <View className="flex-row items-center justify-between mb-2">
                <View className="bg-brand-navy rounded-full px-3 py-1">
                    <Text className="text-brand-white text-xs font-semibold">
                        {job.service_category}
                    </Text>
                </View>
                <Text className="text-text-secondary text-xs">{timeAgo(job.created_at)}</Text>
            </View>

            {/* Seeker name (D16 fix) */}
            <Text className="text-sm text-text-secondary mb-1">👤 {seekerName}</Text>

            {/* Price */}
            <View className="flex-row items-baseline mb-4">
                <Text className="text-2xl font-bold text-text-primary">
                    {job.price_per_hour != null
                        ? `₹${job.price_per_hour.toFixed(0)}`
                        : 'Price on request'
                    }
                </Text>
                {job.price_per_hour != null && (
                    <Text className="text-text-secondary text-sm ml-1">/ hr</Text>
                )}
            </View>

            {/* Action buttons */}
            {busy ? (
                <ActivityIndicator color="#0F172A" />
            ) : isInProgress ? (
                // Sprint 4.3 — In Progress: show Complete Job button
                <TouchableOpacity
                    className="bg-brand-navy rounded-xl py-3 items-center"
                    activeOpacity={0.85}
                    onPress={() => onCompleteJob?.(job.id)}
                >
                    <Text className="text-brand-white text-sm font-semibold">✅ Complete Job</Text>
                </TouchableOpacity>
            ) : isAccepted ? (
                // Active job — show Start Job button
                <TouchableOpacity
                    className="bg-brand-emerald rounded-xl py-3 items-center"
                    activeOpacity={0.85}
                    onPress={() => onStartJob?.(job)}
                >
                    <Text className="text-brand-white text-sm font-semibold">🔐 Start Job</Text>
                </TouchableOpacity>
            ) : (
                // Pending — Accept / Decline
                <View className="flex-row gap-3">
                    <TouchableOpacity
                        className="flex-1 bg-brand-emerald rounded-xl py-3 items-center"
                        activeOpacity={0.85}
                        onPress={() => onAccept?.(job.id)}
                    >
                        <Text className="text-brand-white text-sm font-semibold">Accept</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        className="flex-1 border border-brand-border rounded-xl py-3 items-center"
                        activeOpacity={0.75}
                        onPress={() => onDecline?.(job.id)}
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
    const session = useSelector((state: RootState) => state.auth.session);
    const userId = session?.user?.id ?? null;

    const [jobs, setJobs] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    // Online/Offline status (Sprint 5.2)
    const [isOnline, setIsOnline] = useState(false);
    const [isOnlineLoading, setIsOnlineLoading] = useState(true);

    // PIN modal state (Sprint 4.2)
    const [pinModalJob, setPinModalJob] = useState<Booking | null>(null);   // which job's PIN is being entered
    const [pinError, setPinError] = useState<string | null>(null);
    const [pinLoading, setPinLoading] = useState(false);

    // ── Fetch provider status on mount ────────────────────────────────────────
    
    useEffect(() => {
        if (!userId) return;
        let isMounted = true;
        (async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('is_active')
                .eq('id', userId)
                .single();
            if (isMounted) {
                if (data) setIsOnline(data.is_active);
                setIsOnlineLoading(false);
            }
        })();
        return () => { isMounted = false; };
    }, [userId]);

    // ── Derived sections for SectionList (memoized — B4 fix, Sprint 4.3: +in_progress) ──

    const inProgressJobs = useMemo(() => jobs.filter(j => j.status === 'in_progress'), [jobs]);
    const pendingJobs = useMemo(() => jobs.filter(j => j.status === 'pending'), [jobs]);
    const activeJobs = useMemo(() => jobs.filter(j => j.status === 'accepted'), [jobs]);

    const sections: Section[] = useMemo(() => [
        ...(inProgressJobs.length > 0 ? [{ title: 'In Progress', data: inProgressJobs }] : []),
        ...(activeJobs.length > 0     ? [{ title: 'Active Jobs', data: activeJobs }] : []),
        ...(pendingJobs.length > 0    ? [{ title: 'Pending Requests', data: pendingJobs }] : []),
    ], [inProgressJobs, activeJobs, pendingJobs]);

    // ── Fetch bookings ────────────────────────────────────────────────────────

    const fetchJobs = useCallback(async (silent = false) => {
        if (!userId) return;
        if (!silent) setLoading(true);
        setError(null);

        try {
            // Join seeker's display_name from profiles (fixes D16)
            const { data, error: dbError } = await supabase
                .from('bookings')
                .select('*, seeker:profiles!seeker_id(display_name)')
                .eq('provider_id', userId)
                .in('status', ['pending', 'accepted', 'in_progress'])   // all 3 sections (Sprint 4.3)
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
        let channel: ReturnType<typeof supabase.channel> | null = null;

        const init = async () => {
            await fetchJobs(false);

            if (!isMounted) return;

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
                        setJobs(prev => [payload.new as Booking, ...prev]);
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
        if (actionLoading) return;

        setActionLoading(jobId);
        try {
            const { error: updateError } = await supabase
                .from('bookings')
                .update({ status: newStatus })
                .eq('id', jobId);

            if (updateError) throw new Error(updateError.message);

            // Optimistic removal for declined; update status for accepted
            if (newStatus === 'declined') {
                setJobs(prev => prev.filter(j => j.id !== jobId));
            } else {
                setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: newStatus } : j));
            }
        } catch (err) {
            if (__DEV__) console.warn('[ProviderJobFeed] handleAction:', err);
            await fetchJobs(true);  // re-fetch on failure to restore truth
        } finally {
            setActionLoading(null);
        }
    }, [actionLoading, fetchJobs]);

    // ── PIN Verification — Start Job ──────────────────────────────────────────

    const handlePinSubmit = useCallback(async (enteredPin: string) => {
        if (!pinModalJob || pinLoading) return;

        // B3 fix: null PIN guard — booking predates Sprint 4.2 schema
        if (!pinModalJob.doorstep_pin) {
            setPinError('No PIN was set for this booking. Please contact the Seeker.');
            return;
        }

        // Client-side PIN comparison
        if (enteredPin !== pinModalJob.doorstep_pin) {
            setPinError('Incorrect PIN. Please ask the Seeker to show their screen.');
            return;
        }

        setPinLoading(true);
        setPinError(null);

        try {
            const now = new Date().toISOString();
            const { error: updateError } = await supabase
                .from('bookings')
                .update({ status: 'in_progress', started_at: now })
                .eq('id', pinModalJob.id);

            if (updateError) throw new Error(updateError.message);

            // Optimistic: move from "Active Jobs" → "In Progress" section (Sprint 4.3 fix D5)
            const startedId = pinModalJob!.id;
            setJobs(prev => prev.map(j => j.id === startedId ? { ...j, status: 'in_progress' as const, started_at: now } : j));
            setPinModalJob(null);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to start job. Try again.';
            setPinError(msg);
        } finally {
            setPinLoading(false);
        }
    }, [pinModalJob, pinLoading]);

    // ── Sprint 4.3: Complete Job ───────────────────────────────────────────────

    const handleCompleteJob = useCallback(async (jobId: string) => {
        Alert.alert(
            'Finish Job?',
            'Have you completed the requested service?',
            [
                { text: 'Not Yet', style: 'cancel' },
                {
                    text: 'Yes, Complete',
                    onPress: async () => {
                        setActionLoading(jobId);
                        try {
                            const now = new Date().toISOString();
                            const { error: updateError } = await supabase
                                .from('bookings')
                                .update({ status: 'completed', completed_at: now })
                                .eq('id', jobId);

                            if (updateError) throw new Error(updateError.message);

                            // Optimistic removal — completed jobs leave the feed
                            setJobs(prev => prev.filter(j => j.id !== jobId));
                        } catch (err) {
                            if (__DEV__) console.warn('[ProviderJobFeed] handleCompleteJob:', err);
                            await fetchJobs(true); // re-fetch on failure to restore truth
                        } finally {
                            setActionLoading(null);
                        }
                    },
                },
            ]
        );
    }, [fetchJobs]);

    // ── Provider GPS Broadcaster (Sprint 5.2) ──────────────────────────────────

    const handleToggleOnline = async (value: boolean) => {
        if (!userId) return;
        const previousState = isOnline;
        setIsOnline(value); // Optimistic UI update

        try {
            const { error } = await supabase
                .from('profiles')
                .update({ is_active: value })
                .eq('id', userId);
            if (error) throw new Error(error.message);
        } catch (err) {
            if (__DEV__) console.warn('Failed to update status:', err);
            setIsOnline(previousState); // Revert on failure
            Alert.alert('Update Failed', 'Could not sync status. Please try again.');
        }
    };

    useEffect(() => {
        let locationSubscription: Location.LocationSubscription | null = null;
        let isSubscribed = true; // The Guard Variable

        const startLocationTracking = async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Please grant location access to go online.');
                handleToggleOnline(false); // Snap switch back
                return;
            }

            // If user went offline while waiting for permissions
            if (!isSubscribed) return;

            try {
                const sub = await Location.watchPositionAsync(
                    {
                        accuracy: Location.Accuracy.Balanced,
                        distanceInterval: 50, // Only push changes > 50 meters
                        timeInterval: 60000, // Limit interval to 1 minute
                    },
                    async (loc) => {
                        const { latitude, longitude } = loc.coords;
                        const { error } = await supabase.rpc('set_provider_location', {
                            provider_id: userId,
                            lat: latitude,
                            lng: longitude,
                        });
                        if (error && __DEV__) {
                            console.warn('Failed to broadcast location:', error);
                        }
                    }
                );

                // POST-RESOLVE KILL SWITCH:
                // Check if user toggled switch off *while* watcher was booting up
                if (isSubscribed) {
                    locationSubscription = sub;
                } else {
                    sub.remove();
                }
            } catch (err) {
                if (__DEV__) console.warn('Location tracking failed to start:', err);
            }
        };

        // Only start tracking if the toggle says we are online
        if (isOnline && userId) {
            void startLocationTracking();
        }

        // CLEANUP: Unmounts OR isOnline toggles false
        return () => {
            isSubscribed = false;
            if (locationSubscription) {
                locationSubscription.remove();
            }
        };
    }, [isOnline, userId]);

    // ── Pull-to-refresh ───────────────────────────────────────────────────────

    const handleRefresh = useCallback(() => {
        setRefreshing(true);
        fetchJobs(true);
    }, [fetchJobs]);

    // ── Section Header ────────────────────────────────────────────────────────

    const renderSectionHeader = ({ section }: { section: Section }) => (
        <View className="mx-4 mb-2 mt-1">
            <Text className="text-xs font-bold text-text-secondary uppercase tracking-widest">
                {section.title}
            </Text>
        </View>
    );

    // ── Empty State ───────────────────────────────────────────────────────────

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

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <SafeAreaView className="flex-1 bg-brand-surface">
            <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

            {/* Header */}
            <View className="flex-row items-center justify-between px-4 pt-4 pb-3">
                <View>
                    <Text className="text-xl font-bold text-text-primary">Job Feed</Text>
                    <Text className="text-xs text-text-secondary mt-0.5">
                        {jobs.length > 0
                            ? `${pendingJobs.length} pending · ${activeJobs.length} active · ${inProgressJobs.length} in progress`
                            : 'Live updates enabled'}
                    </Text>
                </View>

                {/* Online/Offline Toggle */}
                {!isOnlineLoading && (
                    <View className="flex-row items-center">
                        <Text className={`text-sm font-semibold mr-2 ${isOnline ? 'text-brand-emerald' : 'text-text-secondary'}`}>
                            {isOnline ? 'Online' : 'Offline'}
                        </Text>
                        <Switch
                            value={isOnline}
                            onValueChange={handleToggleOnline}
                            trackColor={{ false: '#CBD5E1', true: '#10B981' }}
                            thumbColor="#FFFFFF"
                            disabled={actionLoading !== null}
                        />
                    </View>
                )}
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
                <SectionList
                    sections={sections}
                    keyExtractor={item => `${item.id}-${item.status}`}
                    renderItem={({ item }) => (
                        <JobCard
                            job={item}
                            onAccept={id => handleAction(id, 'accepted')}
                            onDecline={id => handleAction(id, 'declined')}
                            onStartJob={job => {
                                setPinError(null);
                                setPinModalJob(job);
                            }}
                            onCompleteJob={handleCompleteJob}
                            actionLoading={actionLoading}
                        />
                    )}
                    renderSectionHeader={renderSectionHeader}
                    ListEmptyComponent={renderEmpty}
                    contentContainerStyle={{ paddingTop: 8, paddingBottom: 32, flexGrow: 1 }}
                    showsVerticalScrollIndicator={false}
                    stickySectionHeadersEnabled={false}
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

            {/* PIN Modal — Doorstep PIN Handshake (Sprint 4.2) */}
            <PinModal
                visible={pinModalJob !== null}
                onSubmit={handlePinSubmit}
                onCancel={() => {
                    setPinModalJob(null);
                    setPinError(null);
                }}
                error={pinError}
                loading={pinLoading}
            />
        </SafeAreaView>
    );
}
