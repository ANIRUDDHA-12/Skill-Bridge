import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ActivityIndicator,
    StyleSheet,
    StatusBar,
    Linking,
    Platform,
} from 'react-native';
import MapView, { UrlTile, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';

// Default region: geographic center of India — shown while GPS is loading
const INDIA_CENTER: Region = {
    latitude: 20.5937,
    longitude: 78.9629,
    latitudeDelta: 15,
    longitudeDelta: 15,
};

// OpenStreetMap tile template
// {s} = subdomain (a/b/c) — UrlTile rotates these automatically for load balancing
const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

interface LocationCoords {
    latitude: number;
    longitude: number;
}

export default function SeekerMapDashboard() {
    const mapRef = useRef<MapView>(null);

    const [location, setLocation] = useState<LocationCoords | null>(null);
    const [locationError, setLocationError] = useState<string | null>(null);
    const [permissionDenied, setPermissionDenied] = useState(false);
    const [gpsLoading, setGpsLoading] = useState(true);

    // ── Request foreground location permission and fetch current position ──
    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();

                if (status !== 'granted') {
                    if (!cancelled) {
                        setPermissionDenied(true);
                        setLocationError('Location access denied. Enable it in Settings to see nearby providers.');
                        setGpsLoading(false);
                    }
                    return;
                }

                const pos = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.Balanced,
                });

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
                            latitudeDelta: 0.02,   // ~2 km zoom
                            longitudeDelta: 0.02,
                        },
                        800 // animation duration ms
                    );
                }
            } catch (err) {
                if (!cancelled) {
                    setLocationError('Could not fetch your location. Please try again.');
                    setGpsLoading(false);
                }
            }
        })();

        return () => { cancelled = true; };
    }, []);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        // onAuthStateChange in App.tsx dispatches clearAuth() → AppNavigator shows AuthStack
    };

    const handleOpenSettings = () => {
        Linking.openSettings();
    };

    return (
        <View style={styles.container}>
            <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

            {/* ── Full-screen OpenStreetMap via UrlTile ── */}
            <MapView
                ref={mapRef}
                style={styles.map}
                initialRegion={INDIA_CENTER}
                showsUserLocation={!permissionDenied}
                showsMyLocationButton={false}
                rotateEnabled={false}
                toolbarEnabled={false}
            >
                {/* OpenStreetMap tiles — avoids Google/Apple Map API costs */}
                <UrlTile
                    urlTemplate={OSM_TILE_URL}
                    maximumZ={19}
                    flipY={false}
                />
            </MapView>

            {/* ── Floating top bar: search + logout ── */}
            <View style={styles.topBar} className="px-4 pt-12">
                {/* Mock search bar — will be wired to Smart Search in Phase 3.2 */}
                <TouchableOpacity
                    style={styles.searchBar}
                    className="flex-1 flex-row items-center bg-brand-white rounded-lg px-4 py-3 border border-brand-border mr-3"
                    activeOpacity={0.8}
                >
                    <Text className="text-text-secondary text-sm flex-1">
                        🔍  Search for services…
                    </Text>
                </TouchableOpacity>

                {/* Logout button */}
                <TouchableOpacity
                    className="bg-brand-navy rounded-lg px-4 py-3 items-center justify-center"
                    onPress={handleLogout}
                    activeOpacity={0.85}
                >
                    <Text className="text-brand-white text-xs font-semibold">
                        Exit
                    </Text>
                </TouchableOpacity>
            </View>

            {/* ── GPS loading overlay ── */}
            {gpsLoading && (
                <View style={styles.loadingOverlay} className="items-center justify-center">
                    <View className="bg-brand-white rounded-xl px-6 py-5 items-center">
                        <ActivityIndicator size="large" color="#0F172A" />
                        <Text className="mt-3 text-sm text-text-secondary">
                            Getting your location…
                        </Text>
                    </View>
                </View>
            )}

            {/* ── Permission denied error card ── */}
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
                        <Text className="text-text-secondary text-sm">
                            Sign Out
                        </Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    // MapView MUST use style prop — NativeWind className does not work on MapView
    map: {
        flex: 1,
    },
    topBar: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        // Subtle shadow so bar is readable over map tiles
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.15,
                shadowRadius: 4,
            },
            android: {
                elevation: 4,
            },
        }),
    },
    searchBar: {
        // Defined separately so TouchableOpacity can get the shadow from topBar
    },
    loadingOverlay: {
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
        // Shadow for card over map
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.2,
                shadowRadius: 8,
            },
            android: {
                elevation: 6,
            },
        }),
    },
});
