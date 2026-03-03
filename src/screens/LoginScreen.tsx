import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    TouchableWithoutFeedback,
    Keyboard,
    Platform,
    SafeAreaView,
    StatusBar,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';

type LoginScreenNavigationProp = NativeStackNavigationProp<
    RootStackParamList,
    'Login'
>;

interface Props {
    navigation: LoginScreenNavigationProp;
}

export default function LoginScreen({ navigation }: Props) {
    const [phone, setPhone] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Strip non-numeric characters and clear error on change
    const handlePhoneChange = useCallback((text: string) => {
        const digits = text.replace(/[^0-9]/g, '');
        setPhone(digits);
        if (error) setError('');
    }, [error]);

    const handleGetOtp = useCallback(() => {
        if (phone.length !== 10) {
            setError('Please enter a valid 10-digit number');
            return;
        }
        // Guard: prevent double-tap pushing OTP screen twice
        if (submitting) return;
        setSubmitting(true);
        navigation.navigate('Otp', { phone });
        // Reset after short delay so back-navigation re-enables the button
        setTimeout(() => setSubmitting(false), 1000);
    }, [phone, submitting, navigation]);

    return (
        <SafeAreaView className="flex-1 bg-brand-white">
            <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
            <KeyboardAvoidingView
                className="flex-1"
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                    <View className="flex-1 justify-center px-6">

                        {/* ── Branding ── */}
                        <View className="mb-14 items-center">
                            {/* Logo placeholder — replace with <Image> in Phase 2 */}
                            <View className="w-14 h-14 rounded-xl bg-brand-navy items-center justify-center mb-4">
                                <Text className="text-brand-white text-2xl font-bold">S</Text>
                            </View>
                            <Text className="text-3xl font-bold text-brand-navy tracking-tight">
                                Skill-Bridge
                            </Text>
                            <Text className="mt-1.5 text-sm text-text-secondary">
                                Your neighbourhood, skilled.
                            </Text>
                        </View>

                        {/* ── Section Header ── */}
                        <Text className="text-xl font-semibold text-text-primary mb-1">
                            Sign In
                        </Text>
                        <Text className="text-sm text-text-secondary mb-5">
                            Enter your mobile number to get a one-time password
                        </Text>

                        {/* ── Phone Input ── */}
                        <View
                            className={`flex-row items-center rounded-lg px-4 py-3.5 bg-brand-surface border ${error ? 'border-red-400' : 'border-brand-border'
                                }`}
                        >
                            {/* Fixed +91 prefix */}
                            <Text className="text-base font-semibold text-text-primary">
                                +91
                            </Text>
                            {/* Vertical divider */}
                            <View className="w-px h-5 bg-brand-border mx-3" />
                            <TextInput
                                className="flex-1 text-base text-text-primary p-0"
                                placeholder="10-digit mobile number"
                                placeholderTextColor="#94A3B8"
                                keyboardType="numeric"
                                maxLength={10}
                                value={phone}
                                onChangeText={handlePhoneChange}
                                returnKeyType="done"
                                onSubmitEditing={handleGetOtp}
                                autoComplete="tel"
                                textContentType="telephoneNumber"
                            />
                        </View>

                        {/* ── Inline Error ── */}
                        {error ? (
                            <Text className="mt-2 text-xs text-red-500 ml-1">{error}</Text>
                        ) : null}

                        {/* ── CTA Button ── */}
                        <TouchableOpacity
                            className={`mt-5 rounded-lg py-4 items-center ${submitting ? 'bg-text-secondary' : 'bg-brand-navy'
                                }`}
                            onPress={handleGetOtp}
                            disabled={submitting}
                            activeOpacity={0.85}
                        >
                            <Text className="text-brand-white text-base font-semibold">
                                {submitting ? 'Sending…' : 'Get OTP'}
                            </Text>
                        </TouchableOpacity>

                        {/* ── Footer ── */}
                        <Text className="mt-8 text-xs text-text-secondary text-center leading-5">
                            By continuing, you agree to our{' '}
                            <Text className="text-brand-navy font-medium">
                                Terms of Service
                            </Text>{' '}
                            and{' '}
                            <Text className="text-brand-navy font-medium">
                                Privacy Policy
                            </Text>
                        </Text>
                    </View>
                </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
