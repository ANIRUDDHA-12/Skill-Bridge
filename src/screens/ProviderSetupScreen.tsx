import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    StatusBar,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '../store/store';
import { setProfileComplete } from '../store/authSlice';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ServiceCategory {
    id: string;
    name: string;
    icon: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProviderSetupScreen() {
    const dispatch = useDispatch<AppDispatch>();

    const [displayName, setDisplayName] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [pricePerHour, setPricePerHour] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Sprint 5.1: Dynamic categories from DB
    const [categories, setCategories] = useState<ServiceCategory[]>([]);
    const [categoriesLoading, setCategoriesLoading] = useState(true);
    const [categoriesError, setCategoriesError] = useState<string | null>(null);

    // ── Fetch categories on mount ────────────────────────────────────────────

    const fetchCategories = async () => {
        setCategoriesLoading(true);
        setCategoriesError(null);
        try {
            const { data, error: dbError } = await supabase
                .from('service_categories')
                .select('id, name, icon')
                .order('name');
            if (dbError) throw new Error(dbError.message);
            setCategories((data as ServiceCategory[]) ?? []);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to load categories.';
            setCategoriesError(msg);
            if (__DEV__) console.warn('[ProviderSetup] fetchCategories:', msg);
        } finally {
            setCategoriesLoading(false);
        }
    };

    useEffect(() => { void fetchCategories(); }, []);

    // ── Validation ────────────────────────────────────────────────────────────

    const validate = (): string | null => {
        if (!displayName.trim()) return 'Please enter your name or business name.';
        if (!selectedCategory) return 'Please select a service category.';
        const price = parseFloat(pricePerHour);
        if (!pricePerHour || isNaN(price) || price <= 0)
            return 'Please enter a valid hourly rate (e.g. 200).';
        return null;
    };

    // ── Submit ────────────────────────────────────────────────────────────────

    const handleSubmit = async () => {
        if (submitting) return;

        const validationError = validate();
        if (validationError) { setError(validationError); return; }

        setSubmitting(true);
        setError(null);

        try {
            // Step 1: Request location permission
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                setError('Location permission is required to appear on the Seeker map. Please enable it in Settings.');
                setSubmitting(false);
                return;
            }

            // Step 2: Get current GPS coordinates (10s timeout so spinner never hangs)
            const GPS_TIMEOUT_MS = 10_000;
            const gpsPromise = Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });
            const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('GPS_TIMEOUT')), GPS_TIMEOUT_MS)
            );
            const pos = await Promise.race([gpsPromise, timeoutPromise]);
            const { latitude, longitude } = pos.coords;

            // Step 3: Get the current user
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            // Step 4: Update profile with form data + GPS location
            // location is stored as PostGIS geography via supabase raw update
            const { error: upsertError } = await supabase
                .from('profiles')
                .update({
                    display_name: displayName.trim(),
                    service_category: selectedCategory!,
                    price_per_hour: parseFloat(pricePerHour),
                    is_active: true,
                    // Use raw PostGIS expression via rpc to set geography column
                })
                .eq('id', user.id);

            if (upsertError) throw new Error(upsertError.message);

            // Step 5: Update location via RPC (PostGIS geography requires native SQL)
            const { error: locationError } = await supabase.rpc(
                'set_provider_location',
                { provider_id: user.id, lat: latitude, lng: longitude }
            );

            // Location RPC failure is non-fatal — profile is saved, location can be retried
            if (locationError && __DEV__) {
                console.warn('[ProviderSetup] location update failed:', locationError.message);
            }

            // Step 6: Mark profile complete → AppNavigator routes to ProviderTeaserDashboard
            dispatch(setProfileComplete(true));

        } catch (err) {
            const isTimeout = err instanceof Error && err.message === 'GPS_TIMEOUT';
            const msg = isTimeout
                ? 'GPS timed out. Please move to an open area and try again.'
                : err instanceof Error ? err.message : 'Something went wrong. Please try again.';
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <SafeAreaView className="flex-1 bg-brand-white">
            <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
            <KeyboardAvoidingView
                className="flex-1"
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView
                    contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingVertical: 32 }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {/* Header */}
                    <Text className="text-3xl font-bold text-text-primary mb-1">
                        Set Up Your Profile
                    </Text>
                    <Text className="text-sm text-text-secondary mb-8 leading-5">
                        This is how Seekers will find and book you on the map.
                    </Text>

                    {/* Display Name */}
                    <Text className="text-sm font-semibold text-text-primary mb-2">
                        Your Name / Business Name
                    </Text>
                    <TextInput
                        className="bg-brand-surface border border-brand-border rounded-xl px-4 py-3.5 text-text-primary text-sm mb-6"
                        placeholder="e.g. Ramesh Plumbing Services"
                        placeholderTextColor="#94A3B8"
                        value={displayName}
                        onChangeText={setDisplayName}
                        autoCapitalize="words"
                        autoCorrect={false}
                        maxLength={60}
                    />

                    {/* Service Category — dynamic chip selector (Sprint 5.1) */}
                    <Text className="text-sm font-semibold text-text-primary mb-3">
                        Service Category
                    </Text>

                    {categoriesLoading ? (
                        <View className="items-center py-6 mb-6">
                            <ActivityIndicator size="small" color="#0F172A" />
                            <Text className="text-xs text-text-secondary mt-2">Loading categories…</Text>
                        </View>
                    ) : categoriesError ? (
                        <View className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6">
                            <Text className="text-red-600 text-sm mb-2">{categoriesError}</Text>
                            <TouchableOpacity onPress={fetchCategories} activeOpacity={0.75}>
                                <Text className="text-brand-navy text-sm font-semibold">Tap to Retry</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View className="flex-row flex-wrap mb-6">
                            {categories.map(cat => {
                                const selected = selectedCategory === cat.name;
                                return (
                                    <TouchableOpacity
                                        key={cat.id}
                                        onPress={() => setSelectedCategory(cat.name)}
                                        className={`mr-2 mb-2 px-4 py-2 rounded-full border ${selected
                                            ? 'bg-brand-navy border-brand-navy'
                                            : 'bg-brand-surface border-brand-border'
                                            }`}
                                        activeOpacity={0.75}
                                    >
                                        <Text
                                            className={`text-sm font-medium ${selected ? 'text-brand-white' : 'text-text-secondary'
                                                }`}
                                        >
                                            {cat.icon} {cat.name}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}

                    {/* Price Per Hour */}
                    <Text className="text-sm font-semibold text-text-primary mb-2">
                        Hourly Rate (₹)
                    </Text>
                    <View className="flex-row items-center bg-brand-surface border border-brand-border rounded-xl px-4 mb-6">
                        <Text className="text-text-secondary text-sm mr-2">₹</Text>
                        <TextInput
                            className="flex-1 py-3.5 text-text-primary text-sm p-0"
                            placeholder="e.g. 300"
                            placeholderTextColor="#94A3B8"
                            value={pricePerHour}
                            onChangeText={setPricePerHour}
                            keyboardType="numeric"
                            maxLength={6}
                        />
                        <Text className="text-text-secondary text-xs ml-1">/ hr</Text>
                    </View>

                    {/* Error message */}
                    {error && (
                        <View className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5">
                            <Text className="text-red-600 text-sm leading-5">{error}</Text>
                        </View>
                    )}

                    {/* Submit */}
                    <TouchableOpacity
                        className={`rounded-xl py-4 items-center justify-center ${submitting ? 'bg-brand-border' : 'bg-brand-navy'
                            }`}
                        onPress={handleSubmit}
                        activeOpacity={0.85}
                        disabled={submitting}
                    >
                        {submitting ? (
                            <ActivityIndicator color="#FFFFFF" />
                        ) : (
                            <Text className="text-brand-white text-sm font-semibold">
                                Save & Go Live on Map
                            </Text>
                        )}
                    </TouchableOpacity>

                    {/* Location note */}
                    <Text className="text-xs text-text-secondary text-center mt-4 leading-4">
                        📍 Your current GPS location will be saved so Seekers can find you nearby.
                    </Text>

                    {/* Sign Out */}
                    <TouchableOpacity
                        className="mt-6 items-center py-2"
                        onPress={() => { void supabase.auth.signOut(); }}
                        activeOpacity={0.7}
                    >
                        <Text className="text-text-secondary text-sm">Sign Out</Text>
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
