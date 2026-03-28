import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Image,
    ActivityIndicator,
    Alert,
    StatusBar,
    ScrollView,
    Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store/store';
import { setKycComplete } from '../store/authSlice';

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProviderKYCScreen() {
    const dispatch = useDispatch<AppDispatch>();
    const session = useSelector((state: RootState) => state.auth.session);
    const userId = session?.user?.id ?? null;

    // ── State ─────────────────────────────────────────────────────────────────
    const [idImage, setIdImage] = useState<string | null>(null);
    const [selfieImage, setSelfieImage] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [kycStatus, setKycStatus] = useState<'unverified' | 'pending' | 'verified'>('unverified');
    const [isLoadingStatus, setIsLoadingStatus] = useState(true);

    // ── Fetch KYC status on mount ─────────────────────────────────────────────

    const fetchKycStatus = async () => {
        if (!userId) return;
        setIsLoadingStatus(true);
        try {
            const { data } = await supabase
                .from('profiles')
                .select('kyc_status')
                .eq('id', userId)
                .single();

            if (data?.kyc_status) {
                setKycStatus(data.kyc_status as 'unverified' | 'pending' | 'verified');

                // If verified, auto-advance past KYC screen
                if (data.kyc_status === 'verified') {
                    dispatch(setKycComplete(true));
                }
            }
        } catch (err) {
            if (__DEV__) console.warn('[KYC] status fetch error:', err);
        } finally {
            setIsLoadingStatus(false);
        }
    };

    useEffect(() => {
        void fetchKycStatus();
    }, [userId]);

    // ── Camera Capture ────────────────────────────────────────────────────────

    const handleCapture = async (type: 'id' | 'selfie') => {
        try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert(
                    'Camera Permission Required',
                    'Please allow camera access in your device settings to capture documents.'
                );
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 0.5,
                allowsEditing: false,
            });

            if (result.canceled || !result.assets?.[0]) return;

            const uri = result.assets[0].uri;
            if (type === 'id') {
                setIdImage(uri);
            } else {
                setSelfieImage(uri);
            }
        } catch (err) {
            if (__DEV__) console.warn(`[KYC] ${type} capture error:`, err);
            Alert.alert('Capture Failed', 'Could not open camera. Please try again.');
        }
    };

    // ── Upload Pipeline ───────────────────────────────────────────────────────

    const handleSubmitDocuments = async () => {
        if (!userId || !idImage || !selfieImage) return;
        setIsUploading(true);

        try {
            // Helper: upload a local URI to Supabase Storage
            const uploadFile = async (uri: string, type: 'id' | 'selfie'): Promise<string> => {
                const ext = uri.substring(uri.lastIndexOf('.') + 1);
                const fileName = `${userId}/${Date.now()}_${type}.${ext}`;

                // Convert local URI to blob
                const response = await fetch(uri);
                const blob = await response.blob();

                const { data, error } = await supabase.storage
                    .from('kyc_documents')
                    .upload(fileName, blob, {
                        contentType: `image/${ext}`,
                        upsert: false,
                    });

                if (error) throw new Error(`Upload failed (${type}): ${error.message}`);
                return data.path;
            };

            // Upload both in parallel
            const [idPath, selfiePath] = await Promise.all([
                uploadFile(idImage, 'id'),
                uploadFile(selfieImage, 'selfie'),
            ]);

            // Update profile with paths and pending status
            const { error: updateError } = await supabase
                .from('profiles')
                .update({
                    kyc_status: 'pending',
                    id_url: idPath,
                    selfie_url: selfiePath,
                })
                .eq('id', userId);

            if (updateError) throw new Error(updateError.message);

            // Transition to pending UI
            setKycStatus('pending');
            dispatch(setKycComplete(true));
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Upload failed. Please try again.';
            if (__DEV__) console.warn('[KYC] submit error:', msg);
            Alert.alert('Submission Failed', msg);
        } finally {
            setIsUploading(false);
        }
    };

    // ── Render ────────────────────────────────────────────────────────────────

    // Loading state
    if (isLoadingStatus) {
        return (
            <SafeAreaView className="flex-1 bg-brand-white items-center justify-center">
                <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
                <ActivityIndicator size="large" color="#0F172A" />
                <Text className="text-sm text-text-secondary mt-4">Checking verification status…</Text>
            </SafeAreaView>
        );
    }

    // Pending state — documents submitted, awaiting review
    if (kycStatus === 'pending') {
        return (
            <SafeAreaView className="flex-1 bg-brand-white">
                <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
                <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, justifyContent: 'center' }}>
                    <View className="items-center">
                        <Text className="text-6xl mb-6">🔍</Text>
                        <Text className="text-2xl font-bold text-text-primary text-center mb-3">
                            Verification in Progress
                        </Text>
                        <Text className="text-sm text-text-secondary text-center leading-5 mb-8 px-4">
                            Your documents have been submitted successfully. Our AI-powered verification system
                            is currently processing your identity. This typically completes within 24 hours.
                            You will be granted full access once verification is approved.
                        </Text>

                        <TouchableOpacity
                            className="bg-brand-navy rounded-xl py-4 px-8 items-center mb-4"
                            activeOpacity={0.85}
                            onPress={fetchKycStatus}
                        >
                            <Text className="text-brand-white text-sm font-semibold">
                                Refresh Status
                            </Text>
                        </TouchableOpacity>

                        <View className="bg-brand-surface border border-brand-border rounded-xl px-5 py-4 mt-4 w-full">
                            <Text className="text-xs text-text-secondary leading-4 text-center">
                                💡 Your profile and GPS data have been saved. Once KYC is approved,
                                you'll be routed directly to your Job Feed.
                            </Text>
                        </View>
                    </View>
                </ScrollView>
            </SafeAreaView>
        );
    }

    // Unverified state — capture documents
    return (
        <SafeAreaView className="flex-1 bg-brand-white">
            <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
            <ScrollView
                contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingVertical: 32 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Header */}
                <Text className="text-3xl font-bold text-text-primary mb-1">
                    Identity Verification
                </Text>
                <Text className="text-sm text-text-secondary mb-8 leading-5">
                    We need to verify your identity before you can accept jobs.
                    Please capture clear photos of your documents using the camera.
                </Text>

                {/* Step 1: Government ID */}
                <View className="mb-6">
                    <Text className="text-sm font-semibold text-text-primary mb-3">
                        Step 1: Front of Government ID (PAN / Aadhaar)
                    </Text>

                    {idImage ? (
                        <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={() => handleCapture('id')}
                        >
                            <Image
                                source={{ uri: idImage }}
                                className="w-full rounded-xl mb-2"
                                style={{ height: 200 }}
                                resizeMode="cover"
                            />
                            <Text className="text-xs text-text-secondary text-center">
                                ✅ Captured — Tap to retake
                            </Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            className="bg-brand-surface border-2 border-dashed border-brand-border rounded-xl items-center justify-center"
                            style={{ height: 160 }}
                            activeOpacity={0.75}
                            onPress={() => handleCapture('id')}
                        >
                            <Text className="text-4xl mb-2">🪪</Text>
                            <Text className="text-sm font-medium text-text-secondary">
                                Tap to Open Camera
                            </Text>
                            <Text className="text-xs text-text-secondary mt-1 opacity-60">
                                PAN Card or Aadhaar Card
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Step 2: Live Selfie */}
                <View className="mb-8">
                    <Text className="text-sm font-semibold text-text-primary mb-3">
                        Step 2: Live Selfie
                    </Text>

                    {selfieImage ? (
                        <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={() => handleCapture('selfie')}
                        >
                            <Image
                                source={{ uri: selfieImage }}
                                className="w-full rounded-xl mb-2"
                                style={{ height: 200 }}
                                resizeMode="cover"
                            />
                            <Text className="text-xs text-text-secondary text-center">
                                ✅ Captured — Tap to retake
                            </Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            className="bg-brand-surface border-2 border-dashed border-brand-border rounded-xl items-center justify-center"
                            style={{ height: 160 }}
                            activeOpacity={0.75}
                            onPress={() => handleCapture('selfie')}
                        >
                            <Text className="text-4xl mb-2">🤳</Text>
                            <Text className="text-sm font-medium text-text-secondary">
                                Tap to Open Camera
                            </Text>
                            <Text className="text-xs text-text-secondary mt-1 opacity-60">
                                Clear, front-facing photo
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Submit Button */}
                <TouchableOpacity
                    className={`rounded-xl py-4 items-center mb-4 ${
                        !idImage || !selfieImage || isUploading
                            ? 'bg-brand-border'
                            : 'bg-brand-navy'
                    }`}
                    disabled={!idImage || !selfieImage || isUploading}
                    activeOpacity={0.85}
                    onPress={handleSubmitDocuments}
                >
                    {isUploading ? (
                        <View className="flex-row items-center">
                            <ActivityIndicator size="small" color="#FFFFFF" />
                            <Text className="text-brand-white text-sm font-semibold ml-3">
                                Uploading Documents…
                            </Text>
                        </View>
                    ) : (
                        <Text className="text-brand-white text-sm font-semibold">
                            Submit Documents
                        </Text>
                    )}
                </TouchableOpacity>

                {/* Privacy Notice */}
                <View className="bg-brand-surface border border-brand-border rounded-xl px-5 py-4 mt-2">
                    <Text className="text-xs text-text-secondary leading-4 text-center">
                        🔒 Your documents are encrypted and stored securely. They are used solely
                        for identity verification and will never be shared with third parties.
                    </Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}
