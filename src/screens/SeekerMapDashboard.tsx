import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    StyleSheet,
    StatusBar,
    Linking,
    Platform,
    KeyboardAvoidingView,
} from 'react-native';
import MapView, { UrlTile, Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
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
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDistance(meters: number): string {
    if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km away`;
    return `${Math.round(meters)} m away`;
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

    // Smart search (Sprint 3.2)
    const [searchQuery, setSearchQuery] = useState('');

    // Bottom sheet — selected provider detail (Sprint 3.3)
    const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);

    // Local filter — null-safe + case-insensitive service_category match
    const filteredProviders = providers.filter(p =>
        (p.service_category ?? '').toLowerCase().includes(searchQuery.toLowerCase())
    );

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

            {/* ── Step 4: Floating top bar — real TextInput search + logout ── */}
            <KeyboardAvoidingView
                style={styles.topBarWrapper}
                // 'padding' on iOS lifts the bar above keyboard; Android manages via WindowSoftInput
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <View style={styles.topBar} className="px-4 pt-12 pb-2">

                    {/* Search bar */}
                    <View className="flex-1 flex-row items-center bg-brand-white rounded-lg px-3 py-2.5 border border-brand-border mr-3">
                        <Text className="text-text-secondary text-sm mr-1.5">🔍</Text>

                        <TextInput
                            className="flex-1 text-text-primary text-sm p-0"
                            placeholder="Search by category (e.g. Plumber)…"
                            placeholderTextColor="#94A3B8"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            autoCapitalize="none"
                            autoCorrect={false}
                            returnKeyType="search"
                        />

                        {/* isFetchingPins spinner — shown while RPC is in-flight */}
                        {isFetchingPins && (
                            <ActivityIndicator
                                size="small"
                                color="#64748B"
                                style={{ marginLeft: 6 }}
                            />
                        )}

                        {/* Clear (✕) button — only shown when query is non-empty */}
                        {searchQuery.length > 0 && !isFetchingPins && (
                            <TouchableOpacity
                                onPress={() => setSearchQuery('')}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                                <Text className="text-text-secondary text-base ml-2">✕</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Logout */}
                    <TouchableOpacity
                        className="bg-brand-navy rounded-lg px-4 py-3 items-center justify-center"
                        onPress={handleLogout}
                        activeOpacity={0.85}
                    >
                        <Text className="text-brand-white text-xs font-semibold">Exit</Text>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>

            {/* Provider count badge — visible once pins load */}
            {!gpsLoading && !permissionDenied && providers.length > 0 && (
                <View style={styles.pinCountBadge} className="bg-brand-emerald rounded-full px-3 py-1">
                    <Text className="text-brand-white text-xs font-semibold">
                        {filteredProviders.length}{' '}
                        {filteredProviders.length === 1 ? 'provider' : 'providers'} nearby
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

                    {/* Book Now — placeholder for Sprint 4.1 */}
                    <TouchableOpacity
                        className="bg-brand-navy rounded-xl py-4 items-center"
                        activeOpacity={0.85}
                        onPress={() => {
                            // Sprint 4.1: navigate to booking flow
                        }}
                    >
                        <Text className="text-brand-white text-sm font-semibold">
                            Book Now
                        </Text>
                    </TouchableOpacity>
                </View>
            )}

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
