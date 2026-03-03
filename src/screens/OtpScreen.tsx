import React, { useState, useRef, useEffect, useCallback } from 'react';
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
    ActivityIndicator,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '../store/store';
import { setSession, setAccountType } from '../store/authSlice';
import { AuthStackParamList } from '../navigation/AppNavigator';
import { supabase } from '../lib/supabase';

type OtpScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'Otp'>;
type OtpScreenRouteProp = RouteProp<AuthStackParamList, 'Otp'>;

interface Props {
    navigation: OtpScreenNavigationProp;
    route: OtpScreenRouteProp;
}

const OTP_LENGTH = 6;          // Supabase email OTP is always 6 digits
const RESEND_COUNTDOWN = 30;

// Mask email: a***@gmail.com
function maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!local || !domain) return email;
    return `${local[0]}***@${domain}`;
}

export default function OtpScreen({ navigation, route }: Props) {
    const { email } = route.params;
    const dispatch = useDispatch<AppDispatch>();

    const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
    const [timer, setTimer] = useState(RESEND_COUNTDOWN);
    const [canResend, setCanResend] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [error, setError] = useState('');

    const inputRefs = useRef<Array<TextInput | null>>(Array(OTP_LENGTH).fill(null));
    const resendFocusRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Auto-focus first box on mount
    useEffect(() => {
        const t = setTimeout(() => inputRefs.current[0]?.focus(), 150);
        return () => clearTimeout(t);
    }, []);

    // Single-interval countdown timer
    useEffect(() => {
        const interval = setInterval(() => {
            setTimer((prev) => {
                if (prev <= 1) { clearInterval(interval); setCanResend(true); return 0; }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // Cleanup resend focus timeout on unmount
    useEffect(() => {
        return () => { if (resendFocusRef.current) clearTimeout(resendFocusRef.current); };
    }, []);

    // Digit entry — handles single digit and paste from SMS autofill
    const handleChange = useCallback((index: number, value: string) => {
        const digits = value.replace(/[^0-9]/g, '');
        if (digits.length > 1) {
            // Paste: distribute digits across boxes from current position
            const newOtp = [...otp];
            digits.split('').slice(0, OTP_LENGTH - index).forEach((d, i) => {
                newOtp[index + i] = d;
            });
            setOtp(newOtp);
            const lastIndex = Math.min(index + digits.length - 1, OTP_LENGTH - 1);
            inputRefs.current[lastIndex < OTP_LENGTH - 1 ? lastIndex + 1 : lastIndex]?.focus();
            return;
        }
        const digit = digits.slice(-1);
        const newOtp = [...otp];
        newOtp[index] = digit;
        setOtp(newOtp);
        if (digit && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus();
    }, [otp]);

    // Backspace retreat
    const handleKeyPress = useCallback((index: number, key: string) => {
        if (key === 'Backspace' && otp[index] === '' && index > 0) {
            const newOtp = [...otp];
            newOtp[index - 1] = '';
            setOtp(newOtp);
            inputRefs.current[index - 1]?.focus();
        }
    }, [otp]);

    // Resend OTP
    const handleResend = useCallback(async () => {
        if (!canResend) return;
        setOtp(Array(OTP_LENGTH).fill(''));
        setTimer(RESEND_COUNTDOWN);
        setCanResend(false);
        setError('');
        resendFocusRef.current = setTimeout(() => inputRefs.current[0]?.focus(), 100);
        await supabase.auth.signInWithOtp({ email });
    }, [canResend, email]);

    // Verify OTP + profile lookup
    const handleVerify = useCallback(async () => {
        const token = otp.join('');
        if (token.length < OTP_LENGTH || verifying) return;
        setVerifying(true);
        setError('');

        try {
            const { data, error: verifyError } = await supabase.auth.verifyOtp({
                email,
                token,
                type: 'email',
            });

            if (verifyError || !data.session || !data.user) {
                // Humanise Supabase errors — their raw messages are often technical
                const raw = verifyError?.message ?? '';
                const humanised =
                    raw.includes('expired') || raw.includes('invalid')
                        ? 'That code is incorrect or has expired. Please request a new one.'
                        : raw || 'Verification failed. Please try again.';
                setError(humanised);
                setVerifying(false);
                return;
            }

            const { session, user } = data;

            // Dispatch session immediately
            dispatch(setSession(session));

            // Query profiles table to check if account_type exists
            const { data: profile } = await supabase
                .from('profiles')
                .select('account_type')
                .eq('id', user.id)
                .single();

            if (profile?.account_type) {
                // Returning user — dispatch accountType → AppNavigator routes to dashboard
                dispatch(setAccountType(profile.account_type as 'seeker' | 'provider'));
            }
            // If PGRST116 (no rows) or any other error: accountType stays null
            // AppNavigator auto-renders SetupStack (RoleSelectionScreen)
            // No navigation.navigate() needed — Redux state drives it

        } catch {
            setError('Network error. Please check your connection and try again.');
            setVerifying(false);
        }
    }, [otp, verifying, email, dispatch]);

    const isComplete = otp.every((d) => d !== '');
    const timerLabel = `0:${String(timer).padStart(2, '0')}`;

    return (
        <SafeAreaView className="flex-1 bg-brand-white">
            <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
            <KeyboardAvoidingView
                className="flex-1"
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                    <View className="flex-1 px-6 pt-4">

                        {/* ── Back Button ── */}
                        <TouchableOpacity
                            onPress={() => navigation.goBack()}
                            className="mb-8 w-10 h-10 items-center justify-center rounded-lg border border-brand-border bg-brand-surface"
                            activeOpacity={0.7}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Text className="text-text-primary text-xl leading-none">‹</Text>
                        </TouchableOpacity>

                        {/* ── Header ── */}
                        <Text className="text-2xl font-bold text-text-primary mb-2">
                            Check your email
                        </Text>
                        <Text className="text-sm text-text-secondary mb-10">
                            We sent a 6-digit OTP to{' '}
                            <Text className="font-semibold text-text-primary">
                                {maskEmail(email)}
                            </Text>
                        </Text>

                        {/* ── OTP Boxes (6 digits — matches Supabase email OTP) ── */}
                        <View className="flex-row justify-center gap-2 mb-4">
                            {otp.map((digit, index) => (
                                <TextInput
                                    key={index}
                                    ref={(ref) => { inputRefs.current[index] = ref; }}
                                    className={`w-12 h-14 text-center text-xl font-bold rounded-lg border bg-brand-surface ${digit ? 'border-brand-navy text-text-primary' : 'border-brand-border text-text-primary'
                                        }`}
                                    keyboardType="numeric"
                                    maxLength={OTP_LENGTH}
                                    value={digit}
                                    onChangeText={(val) => handleChange(index, val)}
                                    onKeyPress={({ nativeEvent }) => handleKeyPress(index, nativeEvent.key)}
                                    selectTextOnFocus
                                    caretHidden
                                />
                            ))}
                        </View>

                        {/* ── Error ── */}
                        {error ? (
                            <Text className="mb-6 text-xs text-red-500 text-center">{error}</Text>
                        ) : <View className="mb-6" />}

                        {/* ── Resend Row ── */}
                        <View className="flex-row items-center justify-center mb-10">
                            <Text className="text-sm text-text-secondary">
                                Didn't receive it?{' '}
                            </Text>
                            <TouchableOpacity
                                onPress={handleResend}
                                disabled={!canResend}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                                <Text className={`text-sm font-semibold ${canResend ? 'text-brand-navy' : 'text-text-secondary'}`}>
                                    {canResend ? 'Resend OTP' : `Resend in ${timerLabel}`}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {/* ── CTA Button ── */}
                        <TouchableOpacity
                            className={`rounded-lg py-4 items-center flex-row justify-center ${isComplete && !verifying ? 'bg-brand-navy' : 'bg-brand-surface border border-brand-border'
                                }`}
                            onPress={handleVerify}
                            disabled={!isComplete || verifying}
                            activeOpacity={0.85}
                        >
                            {verifying && (
                                <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
                            )}
                            <Text className={`text-base font-semibold ${isComplete && !verifying ? 'text-brand-white' : 'text-text-secondary'}`}>
                                {verifying ? 'Verifying…' : 'Verify & Proceed'}
                            </Text>
                        </TouchableOpacity>

                    </View>
                </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
