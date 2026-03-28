import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    StyleSheet,
    StatusBar,
    Linking,
    Platform,
    Modal,
    Alert,
    TextInput
} from 'react-native';
import MapView, { UrlTile, Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSelector } from 'react-redux';
import { RootState } from '../store/store';
import { supabase } from '../lib/supabase';

// Default region: geographic centre of India — shown while GPS is loading
const INDIA_CENTER: Region = {
    latitude: 20.5937,
    longitude: 78.9629,
    latitudeDelta: 15,
    longitudeDelta: 15,
};

// OpenStreetMap tiles — no Google / Apple API costs
const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

// How far from the seeker to search (metres)
const SEARCH_RADIUS_METERS = 5000;

// ── Types ──────────────────────────────────────────────────────────────────────

interface LocationCoords {
    latitude: number;
    longitude: number;
}

interface Provider {
    id: string;
    display_name: string;
    service_category: string;
    price_per_hour: number;
    lat: number;
    lng: number;
    dist_meters: number;
    average_rating: number;
    review_count: number;
    upi_id: string | null;
}

// Sprint 5.1 — service category from DB
interface ServiceCategory {
    id: string;
    name: string;
    icon: string;
}

// Sprint 4.2+4.3 — active booking the seeker is currently tracking
interface ActiveBooking {
    id: string;
    status: 'pending' | 'accepted' | 'in_progress' | 'completed';
    doorstep_pin: string;
    service_category: string;
    provider_id: string;
    price_per_hour: number | null;     // Sprint 4.3: needed for receipt
    started_at: string | null;         // Sprint 4.3: needed for receipt
    completed_at: string | null;       // Sprint 4.3: needed for receipt
    provider?: {
        display_name: string;
        upi_id: string | null;
    };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDistance(meters: number): string {
    if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km away`;
    return `${Math.round(meters)} m away`;
}

// Sprint 4.3 — Receipt cost engine (1-hour minimum billing)
function calculateReceipt(
    startedAt: string | null,
    completedAt: string | null,
    hourlyRate: number | null
) {
    if (!startedAt || !completedAt || hourlyRate == null) {
        return null; // can’t compute — data missing
    }
    const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
    const rawHours = ms / (1000 * 60 * 60);
    const billableHours = Math.max(rawHours, 1.0); // enforce minimum 1 hour
    return {
        totalMinutes: Math.max(Math.round(rawHours * 60), 1),
        billableHours: +billableHours.toFixed(2),
        hourlyRate,
        totalAmount: Math.round(billableHours * hourlyRate),
    };
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function SeekerMapDashboard() {
    const mapRef = useRef<MapView>(null);

    // GPS
    const [location, setLocation] = useState<LocationCoords | null>(null);
    const [locationError, setLocationError] = useState<string | null>(null);
    const [permissionDenied, setPermissionDenied] = useState(false);
    const [gpsError, setGpsError] = useState(false);   // GPS tech failure (distinct from permission)
    const [gpsLoading, setGpsLoading] = useState(true);
    const [retryCount, setRetryCount] = useState(0);   // incrementing retriggers the GPS useEffect

    // Provider pins (Sprint 3.2)
    const [providers, setProviders] = useState<Provider[]>([]);
    const [isFetchingPins, setIsFetchingPins] = useState(false);

    // Sprint 5.1: Category chips replace text search
    const [categories, setCategories] = useState<ServiceCategory[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    // Bottom sheet — selected provider detail (Sprint 3.3)
    const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);

    // Booking (Sprint 4.1)
    const [isBooking, setIsBooking] = useState(false);
    const [bookingError, setBookingError] = useState<string | null>(null);

    // Active booking tracker (Sprint 4.2)
    const [activeBooking, setActiveBooking] = useState<ActiveBooking | null>(null);

    // Review / Rating state (Sprint 6.1)
    const [showRatingModal, setShowRatingModal] = useState(false);
    const [ratingValue, setRatingValue] = useState(0); // 1-5 scale
    const [reviewComment, setReviewComment] = useState('');
    const [isSubmittingReview, setIsSubmittingReview] = useState(false);
    
    // Payments (Sprint 8.1)
    const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

    // Auth session — seeker_id source for booking INSERT
    const session = useSelector((state: RootState) => state.auth.session);
    const userId = session?.user?.id ?? null;

    // Sprint 5.1: Exact category filter (replaces fuzzy text search)
    const filteredProviders = selectedCategory
        ? providers.filter(p => p.service_category === selectedCategory)
        : providers;

    // Clear booking error whenever bottom sheet opens on a new provider or closes
    useEffect(() => {
        setBookingError(null);
    }, [selectedProvider]);

    // ── Sprint 4.2: Restore active booking on mount + real-time UPDATE subscription ──

    useEffect(() => {
        if (!userId) return;

        let isMounted = true;
        let channel: ReturnType<typeof supabase.channel> | null = null;

        const init = async () => {
            // Restore active booking on cold start / app reload
            // Include 'in_progress' and 'completed' so banner/receipt survives reload
            const { data } = await supabase
                .from('bookings')
                .select('id, status, doorstep_pin, service_category, provider_id, price_per_hour, started_at, completed_at, provider:profiles!provider_id(display_name, upi_id)')
                .eq('seeker_id', userId)
                .in('status', ['pending', 'accepted', 'in_progress', 'completed'])
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (data && isMounted) setActiveBooking(data as unknown as ActiveBooking);

            if (!isMounted) return;

            // Subscribe to status changes on the seeker's bookings
            channel = supabase
                .channel(`bookings-seeker-${userId}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'bookings',
                        filter: `seeker_id=eq.${userId}`,
                    },
                    (payload) => {
                        if (!isMounted) return;
                        const updated = payload.new as ActiveBooking;
                        // Remove banner if job is declined or cancelled
                        // Sprint 4.3: 'completed' is NOT removed — receipt must render
                        if (['declined', 'cancelled'].includes(updated.status)) {
                            setActiveBooking(null);
                        } else {
                            // Sprint 8.1: Preserve provider payload relations over websockets
                            setActiveBooking(prev => prev ? { ...updated, provider: prev.provider } : null);
                        }
                    }
                )
                .subscribe();
        };

        void init();

        return () => {
            isMounted = false;
            if (channel) void supabase.removeChannel(channel);
        };
    }, [userId]);

    // ── Sprint 5.1: Fetch categories on mount ────────────────────────────────────

    useEffect(() => {
        (async () => {
            const { data } = await supabase
                .from('service_categories')
                .select('id, name, icon')
                .order('name');
            if (data) setCategories(data as ServiceCategory[]);
        })();
    }, []);

    // ── Step 1: Request foreground location permission and get coords ──────────

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();

                if (status !== 'granted') {
                    if (!cancelled) {
                        setPermissionDenied(true);
                        setLocationError(
                            'Location access denied. Enable it in Settings to see nearby providers.'
                        );
                        setGpsLoading(false);
                    }
                    return;
                }

                // Race GPS against a 10-second timeout so the spinner never hangs indefinitely
                const GPS_TIMEOUT_MS = 10_000;
                const gpsPromise = Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.Balanced,
                });
                const timeoutPromise = new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('GPS_TIMEOUT')), GPS_TIMEOUT_MS)
                );

                const pos = await Promise.race([gpsPromise, timeoutPromise]);

                if (!cancelled) {
                    const coords: LocationCoords = {
                        latitude: pos.coords.latitude,
                        longitude: pos.coords.longitude,
                    };
                    setLocation(coords);
                    setGpsLoading(false);

                    // Animate map to user's actual position
                    mapRef.current?.animateToRegion(
                        {
                            ...coords,
                            latitudeDelta: 0.05,   // ~5 km zoom
                            longitudeDelta: 0.05,
                        },
                        800
                    );
                }
            } catch (err) {
                if (!cancelled) {
                    const isTimeout = err instanceof Error && err.message === 'GPS_TIMEOUT';
                    setLocationError(
                        isTimeout
                            ? 'GPS timed out. Please try again in an open area.'
                            : 'Could not fetch your location. Please try again.'
                    );
                    setGpsError(true);
                    setGpsLoading(false);
                }
            }
        })();

        return () => { cancelled = true; };
        // retryCount in deps: incrementing it re-runs this effect when user taps "Try Again"
    }, [retryCount]);

    // ── Step 2: Supabase RPC — fetch nearby providers once GPS resolves ────────

    const fetchNearbyProviders = useCallback(async (coords: LocationCoords) => {
        setIsFetchingPins(true);
        try {
            const { data, error } = await supabase.rpc('get_providers_nearby', {
                user_lat: coords.latitude,
                user_lng: coords.longitude,
                radius_meters: SEARCH_RADIUS_METERS,
            });

            if (error) {
                // Silent in production — map is still usable without pins
                if (__DEV__) console.warn('[SeekerMapDashboard] fetchNearbyProviders:', error.message);
                return;
            }

            if (Array.isArray(data)) {
                setProviders(data as Provider[]);
            }
        } catch (err) {
            if (__DEV__) console.warn('[SeekerMapDashboard] network error:', err);
        } finally {
            setIsFetchingPins(false);
        }
    }, []);

    // Trigger fetch when location resolves
    useEffect(() => {
        if (location) {
            fetchNearbyProviders(location);
        }
    }, [location, fetchNearbyProviders]);

    // ── Handlers ─────────────────────────────────────────────────────────────

    // ── Sprint 6.1: Submit Review ───────────────────────────────────────────────

    const handleSubmitReview = async () => {
        if (!activeBooking || !userId || ratingValue === 0) return;
        setIsSubmittingReview(true);

        try {
            const { error } = await supabase.from('reviews').insert({
                booking_id: activeBooking.id,
                reviewer_id: userId,
                provider_id: activeBooking.provider_id,
                rating: ratingValue,
                comment: reviewComment.trim() || null,
            });

            if (error) throw new Error(error.message);

            // Success — Cleanup & Return to Map
            setRatingValue(0);
            setReviewComment('');
            setShowRatingModal(false);
            setActiveBooking(null);
            Alert.alert("Thank you!", "Your review has been saved.");
        } catch (err) {
            if (__DEV__) console.warn('Review submit error:', err);
            Alert.alert("Submission Failed", "Could not submit your review. Please try again.");
        } finally {
            setIsSubmittingReview(false);
        }
    };

    // ── Sprint 8.1: UPI Checkout ───────────────────────────────────────────────

    const handleOpenUPI = async (amount: number) => {
        if (!activeBooking || !activeBooking.provider?.upi_id) {
            Alert.alert("Missing UPI ID", "This provider has not set up their UPI ID for digital payments. Please settle directly.");
            return;
        }
        const uri = `upi://pay?pa=${activeBooking.provider.upi_id}&pn=${activeBooking.provider.display_name}&am=${amount}&cu=INR&tn=Skill-Bridge%20Payment`;
        const supported = await Linking.canOpenURL(uri);
        if (supported) {
            await Linking.openURL(uri);
        } else {
            Alert.alert('No UPI App Found', 'Please install a UPI app (Google Pay, PhonePe, Paytm, etc.) to use this feature.');
        }
    };

    const handleMarkPaid = async (amount: number) => {
        if (!activeBooking || !userId) return;
        setIsSubmittingPayment(true);

        try {
            const { error } = await supabase.from('payments').insert({
                booking_id: activeBooking.id,
                payer_id: userId,
                payee_id: activeBooking.provider_id,
                amount
            });

            if (error) throw new Error(error.message);

            // Hide receipt actions and show the rating modal immediately
            setShowRatingModal(true);
        } catch (err) {
            if (__DEV__) console.warn('Payment logging error:', err);
            Alert.alert("Error", "Could not verify payment mapping. Please try again.");
        } finally {
            setIsSubmittingPayment(false);
        }
    };

    // ── Sprint 4.1+4.2: Book Now ────────────────────────────────────────────────

    const handleBookNow = useCallback(async (provider: Provider) => {
        if (isBooking || !session || activeBooking) return; // block if already have an active job

        setIsBooking(true);
        setBookingError(null);

        try {
            // Generate a cryptographically adequate 4-digit PIN
            const doorstep_pin = Math.floor(1000 + Math.random() * 9000).toString();

            const { data, error } = await supabase
                .from('bookings')
                .insert({
                    seeker_id: session.user.id,
                    provider_id: provider.id,
                    service_category: provider.service_category,
                    price_per_hour: provider.price_per_hour,
                    doorstep_pin,
                    // status defaults to 'pending' on DB side
                })
                .select('id, status, doorstep_pin, service_category, provider_id, price_per_hour')
                .single();

            if (error) throw new Error(error.message);

            // Set active booking — banner replaces search bar
            // Include price_per_hour for future receipt (Sprint 4.3)
            // Include Provider deep reference mapping (Sprint 8.1)
            setActiveBooking({
                ...(data as ActiveBooking),
                price_per_hour: provider.price_per_hour,
                started_at: null,
                completed_at: null,
                provider: {
                    display_name: provider.display_name,
                    upi_id: provider.upi_id
                }
            });
            setSelectedProvider(null);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Booking failed. Please try again.';
            setBookingError(msg);
        } finally {
            setIsBooking(false);
        }
    }, [isBooking, session, activeBooking]);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        // onAuthStateChange in App.tsx dispatches clearAuth() → AuthStack shown
    };

    const handleOpenSettings = () => {
        Linking.openSettings();
    };


    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <View style={styles.container}>
            <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

            {/* ── Step 2 & 3: Full-screen map with OSM tiles + provider Markers ── */}
            {/* NOTE: MapView does not support NativeWind className — use style prop */}
            <MapView
                ref={mapRef}
                style={styles.map}
                initialRegion={INDIA_CENTER}
                showsUserLocation={!permissionDenied}
                showsMyLocationButton={false}
                rotateEnabled={false}
                toolbarEnabled={false}
                onPress={() => setSelectedProvider(null)}  // dismiss bottom sheet on map tap
            >
                {/* OpenStreetMap tiles */}
                <UrlTile
                    urlTemplate={OSM_TILE_URL}
                    maximumZ={19}
                    flipY={false}
                />

                {/* Step 3: Provider pins — filtered by search, onPress opens bottom sheet */}
                {filteredProviders.map(p => (
                    <Marker
                        key={p.id}
                        coordinate={{ latitude: p.lat, longitude: p.lng }}
                        title={p.display_name}
                        description={`${p.service_category} · ${formatDistance(p.dist_meters)}`}
                        pinColor="#10B981"
                        onPress={() => setSelectedProvider(p)}
                    />
                ))}
            </MapView>

            {/* ── Step 4: Floating top bar — Active Job Banner OR Category Chips ── */}
            <View style={styles.topBarWrapper}>
                <View style={styles.topBar} className="px-4 pt-12 pb-2">

                    {activeBooking && activeBooking.status !== 'completed' ? (
                        // ── Active Job Banner (Sprint 4.2) ──
                        <View className="flex-1 bg-brand-white rounded-2xl px-4 py-3 border border-brand-border">
                            {/* Status row */}
                            {activeBooking.status === 'pending' && (
                                <>
                                    <View className="flex-row items-center mb-1">
                                        <View className="w-2 h-2 rounded-full bg-yellow-400 mr-2" />
                                        <Text className="text-xs font-semibold text-text-secondary uppercase tracking-widest">
                                            Active Job
                                        </Text>
                                    </View>
                                    <Text className="text-base font-bold text-text-primary">
                                        Waiting for Provider…
                                    </Text>
                                    <Text className="text-xs text-text-secondary mt-0.5">
                                        {activeBooking.service_category}
                                    </Text>
                                </>
                            )}
                            {activeBooking.status === 'accepted' && (
                                <>
                                    <View className="flex-row items-center mb-1">
                                        <View className="w-2 h-2 rounded-full bg-brand-emerald mr-2" />
                                        <Text className="text-xs font-semibold text-text-secondary uppercase tracking-widest">
                                            Provider on the Way!
                                        </Text>
                                    </View>
                                    <Text className="text-sm text-text-secondary mb-2">Show this PIN at the door:</Text>
                                    <View className="bg-brand-surface rounded-xl px-4 py-3 items-center">
                                        <Text style={{ fontSize: 28, fontWeight: '800', letterSpacing: 14, color: '#0F172A' }}>
                                            {activeBooking.doorstep_pin}
                                        </Text>
                                    </View>
                                </>
                            )}
                            {activeBooking.status === 'in_progress' && (
                                <>
                                    <View className="flex-row items-center mb-1">
                                        <View className="w-2 h-2 rounded-full bg-brand-navy mr-2" />
                                        <Text className="text-xs font-semibold text-text-secondary uppercase tracking-widest">
                                            Job In Progress
                                        </Text>
                                    </View>
                                    <Text className="text-base font-bold text-text-primary">
                                        {activeBooking.service_category} underway
                                    </Text>
                                </>
                            )}
                            {/* Exit button — always accessible from banner (B2 fix) */}
                            <TouchableOpacity
                                className="mt-3 py-1 items-center"
                                onPress={handleLogout}
                                activeOpacity={0.7}
                            >
                                <Text className="text-xs text-text-secondary">Sign Out</Text>
                            </TouchableOpacity>
                        </View>
                    ) : !activeBooking ? (
                        // ── Sprint 5.1: Category Chips (replace search bar) ──
                        <View className="flex-1 flex-row items-center">
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={{ paddingRight: 8 }}
                                className="flex-1"
                            >
                                {/* "All" chip — selected when no category filter (D5) */}
                                <TouchableOpacity
                                    onPress={() => setSelectedCategory(null)}
                                    className={`mr-2 px-4 py-2 rounded-full border ${
                                        selectedCategory === null
                                            ? 'bg-brand-navy border-brand-navy'
                                            : 'bg-brand-white border-brand-border'
                                    }`}
                                    activeOpacity={0.75}
                                >
                                    <Text className={`text-sm font-medium ${
                                        selectedCategory === null ? 'text-brand-white' : 'text-text-primary'
                                    }`}>
                                        🏠 All
                                    </Text>
                                </TouchableOpacity>

                                {/* Dynamic category chips */}
                                {categories.map(cat => {
                                    const selected = selectedCategory === cat.name;
                                    return (
                                        <TouchableOpacity
                                            key={cat.id}
                                            onPress={() => setSelectedCategory(
                                                selected ? null : cat.name
                                            )}
                                            className={`mr-2 px-4 py-2 rounded-full border ${
                                                selected
                                                    ? 'bg-brand-navy border-brand-navy'
                                                    : 'bg-brand-white border-brand-border'
                                            }`}
                                            activeOpacity={0.75}
                                        >
                                            <Text className={`text-sm font-medium ${
                                                selected ? 'text-brand-white' : 'text-text-primary'
                                            }`}>
                                                {cat.icon} {cat.name}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>

                            {/* Logout */}
                            <TouchableOpacity
                                className="bg-brand-navy rounded-lg px-4 py-3 items-center justify-center ml-2"
                                onPress={handleLogout}
                                activeOpacity={0.85}
                            >
                                <Text className="text-brand-white text-xs font-semibold">Exit</Text>
                            </TouchableOpacity>
                        </View>
                    ) : null}
                </View>
            </View>

            {/* Provider count badge — visible once pins load (Sprint 5.1: shows loading state) */}
            {!gpsLoading && !permissionDenied && providers.length > 0 && (
                <View style={styles.pinCountBadge} className="bg-brand-emerald rounded-full px-3 py-1">
                    <Text className="text-brand-white text-xs font-semibold">
                        {isFetchingPins ? 'Loading…' : (
                            `${filteredProviders.length} ${filteredProviders.length === 1 ? 'provider' : 'providers'} nearby`
                        )}
                    </Text>
                </View>
            )}

            {/* ── Sprint 5.1: Zero Results empty state ── */}
            {selectedCategory && filteredProviders.length === 0 && !gpsLoading && !isFetchingPins && (
                <View style={styles.errorCard} className="mx-6 bg-brand-surface rounded-2xl p-6 items-center">
                    <Text className="text-3xl mb-3">🔍</Text>
                    <Text className="text-base font-bold text-text-primary text-center mb-2">
                        No {selectedCategory}s found within 5km
                    </Text>
                    <Text className="text-sm text-text-secondary text-center leading-5">
                        Try a different category or check back later.
                    </Text>
                </View>
            )}

            {/* ── GPS loading overlay ── */}
            {gpsLoading && (
                <View style={styles.fullOverlay} className="items-center justify-center">
                    <View className="bg-brand-white rounded-xl px-6 py-5 items-center">
                        <ActivityIndicator size="large" color="#0F172A" />
                        <Text className="mt-3 text-sm text-text-secondary">
                            Getting your location…
                        </Text>
                    </View>
                </View>
            )}

            {/* ── Provider Detail Bottom Sheet (Sprint 3.3) ── */}
            {selectedProvider && (
                <View style={styles.bottomSheet}>
                    {/* Close button */}
                    <TouchableOpacity
                        style={styles.bottomSheetClose}
                        onPress={() => setSelectedProvider(null)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <Text className="text-text-secondary text-lg font-bold">✕</Text>
                    </TouchableOpacity>

                    {/* Drag handle */}
                    <View style={styles.dragHandle} />

                    {/* Provider name + category badge */}
                    <Text className="text-xl font-bold text-text-primary mt-3 mb-1">
                        {selectedProvider.display_name ?? 'Unknown Provider'}
                    </Text>

                    {/* Sprint 6.1: Ratings Display */}
                    <View className="mb-3">
                        {(!selectedProvider.review_count || selectedProvider.review_count === 0) ? (
                            <Text className="text-sm font-medium text-text-secondary italic">
                                ⭐ New Provider
                            </Text>
                        ) : (
                            <Text className="text-sm font-bold text-[#EAB308]">
                                ⭐ {selectedProvider.average_rating.toFixed(1)}{' '}
                                <Text className="font-normal text-text-secondary ml-1">
                                    ({selectedProvider.review_count} {selectedProvider.review_count === 1 ? 'job' : 'jobs'})
                                </Text>
                            </Text>
                        )}
                    </View>

                    <View className="flex-row items-center mb-4">
                        <View className="bg-brand-navy rounded-full px-3 py-1 mr-2">
                            <Text className="text-brand-white text-xs font-medium">
                                {selectedProvider.service_category}
                            </Text>
                        </View>
                        <Text className="text-text-secondary text-sm">
                            {formatDistance(selectedProvider.dist_meters)}
                        </Text>
                    </View>

                    {/* Price */}
                    <View className="flex-row items-baseline mb-6">
                        <Text className="text-2xl font-bold text-text-primary">
                            {selectedProvider.price_per_hour != null
                                ? `₹${selectedProvider.price_per_hour.toFixed(0)}`
                                : 'Price on request'
                            }
                        </Text>
                        {selectedProvider.price_per_hour != null && (
                            <Text className="text-text-secondary text-sm ml-1">/ hr</Text>
                        )}
                    </View>

                    {/* Booking error — shown inline inside sheet */}
                    {bookingError && (
                        <View className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
                            <Text className="text-red-600 text-sm">{bookingError}</Text>
                        </View>
                    )}

                    {/* Book Now — wired to Supabase INSERT (Sprint 4.1+4.2) */}
                    {activeBooking ? (
                        // B6 fix: clearly block re-booking with informative message
                        <View className="bg-brand-surface rounded-xl py-4 px-4 items-center">
                            <Text className="text-text-secondary text-sm text-center">
                                You already have an active booking.
                            </Text>
                        </View>
                    ) : (
                        <TouchableOpacity
                            className={`rounded-xl py-4 items-center justify-center ${isBooking ? 'bg-brand-border' : 'bg-brand-navy'}`}
                            activeOpacity={0.85}
                            disabled={isBooking}
                            onPress={() => selectedProvider && handleBookNow(selectedProvider)}
                        >
                            {isBooking ? (
                                <ActivityIndicator color="#FFFFFF" />
                            ) : (
                                <Text className="text-brand-white text-sm font-semibold">Book Now</Text>
                            )}
                        </TouchableOpacity>
                    )}
                </View>
            )}

            {/* ── Sprint 4.3: Job Receipt Modal (status === completed) ── */}
            {activeBooking?.status === 'completed' && (() => {
                const receipt = calculateReceipt(
                    activeBooking.started_at,
                    activeBooking.completed_at,
                    activeBooking.price_per_hour
                );
                return (
                    <Modal transparent animationType="fade" visible>
                        <View style={styles.fullOverlay} className="items-center justify-center px-6">
                            {showRatingModal ? (
                                <View className="bg-brand-white rounded-2xl p-6 w-full" style={{ maxWidth: 360 }}>
                                    <Text className="text-2xl font-bold text-text-primary text-center mb-2">
                                        Rate your Provider
                                    </Text>
                                    <Text className="text-sm text-text-secondary text-center mb-6">
                                        How was your experience with your Provider?
                                    </Text>

                                    {/* Star Selector */}
                                    <View className="flex-row justify-center mb-6">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                            <TouchableOpacity key={star} onPress={() => setRatingValue(star)} activeOpacity={0.7} className="mx-1">
                                                <Text className={`text-4xl ${ratingValue >= star ? 'opacity-100' : 'opacity-25 grayscale'}`}>
                                                    ⭐
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    {/* Comment Input */}
                                    <TextInput
                                        placeholder="Write an optional review..."
                                        multiline
                                        numberOfLines={3}
                                        className="bg-brand-surface border border-brand-border rounded-xl p-4 text-text-primary mb-6"
                                        value={reviewComment}
                                        onChangeText={setReviewComment}
                                        textAlignVertical="top"
                                    />

                                    {/* Submit Action */}
                                    <TouchableOpacity
                                        className={`rounded-xl py-4 mb-3 items-center ${ratingValue === 0 || isSubmittingReview ? 'bg-brand-border' : 'bg-brand-navy'}`}
                                        disabled={ratingValue === 0 || isSubmittingReview}
                                        onPress={handleSubmitReview}
                                    >
                                        {isSubmittingReview ? <ActivityIndicator color="#fff" /> : <Text className="text-brand-white font-semibold">Submit Review</Text>}
                                    </TouchableOpacity>

                                    {/* Skip Action */}
                                    <TouchableOpacity
                                        className="py-3 items-center"
                                        disabled={isSubmittingReview}
                                        onPress={() => {
                                            setShowRatingModal(false);
                                            setActiveBooking(null); // Return to map
                                        }}
                                    >
                                        <Text className="text-text-secondary font-medium">Skip for now</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <View className="bg-brand-white rounded-2xl p-6 w-full" style={{ maxWidth: 360 }}>
                                    {/* Header */}
                                    <Text className="text-2xl font-bold text-text-primary text-center mb-1">
                                        ✅ Job Completed!
                                    </Text>
                                    <Text className="text-sm text-text-secondary text-center mb-5">
                                        {activeBooking.service_category}
                                    </Text>

                                    {/* Divider */}
                                    <View className="border-b border-brand-border mb-4" />

                                    {receipt ? (
                                        <>
                                            {/* Time */}
                                            <View className="flex-row justify-between mb-2">
                                                <Text className="text-sm text-text-secondary">Time Elapsed</Text>
                                                <Text className="text-sm font-semibold text-text-primary">
                                                    {receipt.totalMinutes < 60
                                                        ? `${receipt.totalMinutes} min`
                                                        : `${Math.floor(receipt.totalMinutes / 60)} hr ${receipt.totalMinutes % 60} min`}
                                                </Text>
                                            </View>

                                            {/* Rate */}
                                            <View className="flex-row justify-between mb-2">
                                                <Text className="text-sm text-text-secondary">Hourly Rate</Text>
                                                <Text className="text-sm font-semibold text-text-primary">
                                                    ₹{receipt.hourlyRate}/hr
                                                </Text>
                                            </View>

                                            {/* Billable hours */}
                                            <View className="flex-row justify-between mb-4">
                                                <Text className="text-sm text-text-secondary">Billable Hours</Text>
                                                <Text className="text-sm font-semibold text-text-primary">
                                                    {receipt.billableHours} hr{receipt.billableHours !== 1 ? 's' : ''}
                                                </Text>
                                            </View>

                                            {/* Divider */}
                                            <View className="border-b border-brand-border mb-4" />

                                            {/* Total */}
                                            <View className="flex-row justify-between items-baseline mb-2">
                                                <Text className="text-base font-bold text-text-primary">Final Amount</Text>
                                                <Text className="text-2xl font-bold text-text-primary">
                                                    ₹{receipt.totalAmount}
                                                </Text>
                                            </View>
                                            {/* Final Actions Container (Sprint 8.1) */}
                                            <View className="mt-4">
                                                <TouchableOpacity
                                                    className="bg-brand-navy rounded-xl py-4 items-center mb-3 flex-row justify-center"
                                                    activeOpacity={0.85}
                                                    onPress={() => handleOpenUPI(receipt.totalAmount)}
                                                >
                                                    <Text className="text-xl mr-2">🔗</Text>
                                                    <Text className="text-brand-white text-[15px] font-semibold">
                                                        Pay ₹{receipt.totalAmount} via UPI Apps
                                                    </Text>
                                                </TouchableOpacity>

                                                <TouchableOpacity
                                                    className={`py-3 items-center ${isSubmittingPayment ? 'opacity-50' : ''}`}
                                                    activeOpacity={0.6}
                                                    disabled={isSubmittingPayment}
                                                    onPress={() => handleMarkPaid(receipt.totalAmount)}
                                                >
                                                    {isSubmittingPayment ? (
                                                        <ActivityIndicator size="small" color="#0F172A" />
                                                    ) : (
                                                        <Text className="text-brand-navy font-semibold text-sm">
                                                            Mark Paid & Rate Provider
                                                        </Text>
                                                    )}
                                                </TouchableOpacity>
                                            </View>
                                        </>
                                    ) : (
                                        <View className="mb-5">
                                            <Text className="text-sm text-text-secondary text-center">
                                                Duration unavailable — settle directly with the Provider.
                                            </Text>
                                            
                                            <TouchableOpacity
                                                className="bg-brand-navy rounded-xl py-4 items-center mt-6"
                                                activeOpacity={0.85}
                                                onPress={() => setShowRatingModal(true)}
                                            >
                                                <Text className="text-brand-white text-sm font-semibold">
                                                    Rate Provider
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                </View>
                            )}
                        </View>
                    </Modal>
                );
            })()}

            {/* ── Permission denied card ── */}
            {permissionDenied && (
                <View style={styles.errorCard} className="mx-6 bg-brand-white rounded-xl p-6 items-center">
                    <Text className="text-2xl mb-2">📍</Text>
                    <Text className="text-base font-bold text-text-primary text-center mb-2">
                        Location Access Needed
                    </Text>
                    <Text className="text-sm text-text-secondary text-center mb-5 leading-5">
                        {locationError}
                    </Text>
                    <TouchableOpacity
                        className="bg-brand-navy rounded-lg px-6 py-3 w-full items-center"
                        onPress={handleOpenSettings}
                        activeOpacity={0.85}
                    >
                        <Text className="text-brand-white text-sm font-semibold">
                            Open Settings
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        className="mt-3 py-2 w-full items-center"
                        onPress={handleLogout}
                        activeOpacity={0.7}
                    >
                        <Text className="text-text-secondary text-sm">Sign Out</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* ── GPS technical error card (timeout / device error — NOT permission) ── */}
            {gpsError && !permissionDenied && (
                <View style={styles.errorCard} className="mx-6 bg-brand-white rounded-xl p-6 items-center">
                    <Text className="text-2xl mb-2">⚠️</Text>
                    <Text className="text-base font-bold text-text-primary text-center mb-2">
                        Location Unavailable
                    </Text>
                    <Text className="text-sm text-text-secondary text-center mb-5 leading-5">
                        {locationError}
                    </Text>
                    <TouchableOpacity
                        className="bg-brand-navy rounded-lg px-6 py-3 w-full items-center"
                        onPress={() => {
                            // Retry: reset GPS state and increment retryCount → re-runs useEffect
                            setGpsError(false);
                            setLocationError(null);
                            setGpsLoading(true);
                            setRetryCount(c => c + 1);
                        }}
                        activeOpacity={0.85}
                    >
                        <Text className="text-brand-white text-sm font-semibold">Try Again</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        className="mt-3 py-2 w-full items-center"
                        onPress={handleLogout}
                        activeOpacity={0.7}
                    >
                        <Text className="text-text-secondary text-sm">Sign Out</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const SHADOW_STYLE = Platform.select({
    ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
    },
    android: { elevation: 4 },
});

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    // MapView MUST use style prop — NativeWind className is not supported on MapView
    map: {
        flex: 1,
    },
    topBarWrapper: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
    },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        ...SHADOW_STYLE,
    },
    pinCountBadge: {
        position: 'absolute',
        bottom: 100,
        alignSelf: 'center',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 4,
            },
            android: { elevation: 4 },
        }),
    },
    fullOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.25)',
    },
    errorCard: {
        position: 'absolute',
        bottom: 60,
        left: 0,
        right: 0,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.2,
                shadowRadius: 8,
            },
            android: { elevation: 6 },
        }),
    },
    // ── Provider Detail Bottom Sheet ─────────────────────────────────────────
    bottomSheet: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#F8FAFC',   // brand-surface
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 24,
        paddingBottom: 36,
        paddingTop: 16,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: -4 },
                shadowOpacity: 0.12,
                shadowRadius: 12,
            },
            android: { elevation: 16 },
        }),
    },
    dragHandle: {
        width: 40,
        height: 4,
        backgroundColor: '#E2E8F0',  // brand-border
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 4,
    },
    bottomSheetClose: {
        position: 'absolute',
        top: 16,
        right: 20,
        padding: 4,
    },
});
