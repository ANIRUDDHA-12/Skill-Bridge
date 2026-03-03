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
import { AuthStackParamList } from '../navigation/AppNavigator';
import { supabase } from '../lib/supabase';

type LoginScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

interface Props {
    navigation: LoginScreenNavigationProp;
}

// Basic email format validation
const isValidEmail = (email: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

export default function LoginScreen({ navigation }: Props) {
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleEmailChange = useCallback((text: string) => {
        setEmail(text);
        if (error) setError('');
    }, [error]);

    const handleGetOtp = useCallback(async () => {
        const trimmedEmail = email.trim();

        if (!isValidEmail(trimmedEmail)) {
            setError('Please enter a valid email address');
            return;
        }
        if (submitting) return;

        setSubmitting(true);
        setError('');

        try {
            const { error: supaError } = await supabase.auth.signInWithOtp({
                email: trimmedEmail,
            });

            if (supaError) {
                // Humanise common Supabase errors
                const raw = supaError.message;
                const humanised =
                    raw.includes('rate') || raw.includes('limit')
                        ? 'Too many attempts. Please wait a minute and try again.'
                        : raw.includes('invalid') || raw.includes('unable to validate')
                            ? 'That doesn\'t look like a valid email address.'
                            : 'Something went wrong. Please try again.';
                setError(humanised);
                setSubmitting(false);
                return;
            }

            // Success — navigate to OTP screen
            navigation.navigate('Otp', { email: trimmedEmail });
        } catch {
            setError('Network error. Please check your connection and try again.');
        } finally {
            setSubmitting(false);
        }
    }, [email, submitting, navigation]);

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
                            Enter your email address to get a one-time password
                        </Text>

                        {/* ── Email Input ── */}
                        <View
                            className={`flex-row items-center rounded-lg px-4 py-3.5 bg-brand-surface border ${error ? 'border-red-400' : 'border-brand-border'
                                }`}
                        >
                            <TextInput
                                className="flex-1 text-base text-text-primary p-0"
                                placeholder="you@example.com"
                                placeholderTextColor="#94A3B8"
                                keyboardType="email-address"
                                autoCapitalize="none"
                                autoCorrect={false}
                                autoComplete="email"
                                textContentType="emailAddress"
                                value={email}
                                maxLength={254}  // RFC 5321 email max length
                                onChangeText={handleEmailChange}
                                returnKeyType="done"
                                onSubmitEditing={handleGetOtp}
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
                            <Text className="text-brand-navy font-medium">Terms of Service</Text>
                            {' '}and{' '}
                            <Text className="text-brand-navy font-medium">Privacy Policy</Text>
                        </Text>
                    </View>
                </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
