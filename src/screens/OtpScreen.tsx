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
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';

type OtpScreenNavigationProp = NativeStackNavigationProp<
    RootStackParamList,
    'Otp'
>;
type OtpScreenRouteProp = RouteProp<RootStackParamList, 'Otp'>;

interface Props {
    navigation: OtpScreenNavigationProp;
    route: OtpScreenRouteProp;
}

const OTP_LENGTH = 4;
const RESEND_COUNTDOWN = 30;

export default function OtpScreen({ navigation, route }: Props) {
    const { phone } = route.params;

    // One string per OTP box
    const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
    const [timer, setTimer] = useState(RESEND_COUNTDOWN);
    const [canResend, setCanResend] = useState(false);

    // Refs for each TextInput box
    const inputRefs = useRef<Array<TextInput | null>>(Array(OTP_LENGTH).fill(null));

    // Ref for resend focus timeout — cleaned up on unmount
    const resendFocusRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Auto-focus first box on mount ──
    useEffect(() => {
        const t = setTimeout(() => {
            inputRefs.current[0]?.focus();
        }, 150);
        return () => clearTimeout(t);
    }, []);

    // ── Single-interval countdown timer ──
    // FIX: Uses one interval (not 30) — runs once, counts down internally
    useEffect(() => {
        const interval = setInterval(() => {
            setTimer((prev) => {
                if (prev <= 1) {
                    clearInterval(interval);
                    setCanResend(true);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, []); // ← empty deps: single interval for the entire countdown

    // ── Cleanup resend focus timeout on unmount ──
    useEffect(() => {
        return () => {
            if (resendFocusRef.current) clearTimeout(resendFocusRef.current);
        };
    }, []);

    // ── Digit entry: store → advance. Also handles paste from SMS autofill ──
    const handleChange = useCallback((index: number, value: string) => {
        const digits = value.replace(/[^0-9]/g, '');

        // FIX: Paste scenario — distribute digits across boxes from current position
        if (digits.length > 1) {
            const newOtp = [...otp];
            digits.split('').slice(0, OTP_LENGTH - index).forEach((d, i) => {
                newOtp[index + i] = d;
            });
            setOtp(newOtp);
            // Focus the last filled box (or the box after it if not the last)
            const lastIndex = Math.min(index + digits.length - 1, OTP_LENGTH - 1);
            const focusIndex = lastIndex < OTP_LENGTH - 1 ? lastIndex + 1 : lastIndex;
            inputRefs.current[focusIndex]?.focus();
            return;
        }

        // Single digit entry
        const digit = digits.slice(-1);
        const newOtp = [...otp];
        newOtp[index] = digit;
        setOtp(newOtp);

        // Auto-advance if digit was entered and not last box
        if (digit && index < OTP_LENGTH - 1) {
            inputRefs.current[index + 1]?.focus();
        }
    }, [otp]);

    // ── Backspace: clear current or retreat ──
    const handleKeyPress = useCallback((index: number, key: string) => {
        if (key === 'Backspace') {
            if (otp[index] === '' && index > 0) {
                // Current box is empty → clear previous and move back
                const newOtp = [...otp];
                newOtp[index - 1] = '';
                setOtp(newOtp);
                inputRefs.current[index - 1]?.focus();
            }
        }
    }, [otp]);

    // ── Resend OTP ──
    const handleResend = useCallback(() => {
        if (!canResend) return;
        setOtp(Array(OTP_LENGTH).fill(''));
        setTimer(RESEND_COUNTDOWN);
        setCanResend(false);
        // FIX: Store ref so it can be cleared on unmount
        resendFocusRef.current = setTimeout(() => inputRefs.current[0]?.focus(), 100);
        // ← Phase 2: trigger Supabase resend SMS here
    }, [canResend]);

    // ── Verify ──
    const handleVerify = useCallback(() => {
        const otpValue = otp.join('');
        if (otpValue.length < OTP_LENGTH) return;
        // ← Phase 2: call Supabase verifyOtp(phone, otpValue) here
        console.log('[Skill-Bridge] OTP to verify:', otpValue, 'for +91', phone);
    }, [otp, phone]);

    const isComplete = otp.every((d) => d !== '');

    // Masked phone: +91 XXXXX-XX123
    const maskedPhone = `+91 XXXXX-XX${phone.slice(-3)}`;
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
                            Verify your number
                        </Text>
                        <Text className="text-sm text-text-secondary mb-10">
                            We sent a 4-digit OTP to{' '}
                            <Text className="font-semibold text-text-primary">
                                {maskedPhone}
                            </Text>
                        </Text>

                        {/* ── OTP Boxes ── */}
                        <View className="flex-row justify-between mb-8 px-2">
                            {otp.map((digit, index) => (
                                <TextInput
                                    key={index}
                                    ref={(ref) => {
                                        inputRefs.current[index] = ref;
                                    }}
                                    className={`w-16 h-16 text-center text-2xl font-bold rounded-lg border bg-brand-surface ${digit
                                            ? 'border-brand-navy text-text-primary'
                                            : 'border-brand-border text-text-primary'
                                        }`}
                                    keyboardType="numeric"
                                    maxLength={OTP_LENGTH} // allow paste of full OTP
                                    value={digit}
                                    onChangeText={(val) => handleChange(index, val)}
                                    onKeyPress={({ nativeEvent }) =>
                                        handleKeyPress(index, nativeEvent.key)
                                    }
                                    selectTextOnFocus
                                    caretHidden
                                />
                            ))}
                        </View>

                        {/* ── Resend Row ── */}
                        <View className="flex-row items-center justify-center mb-10">
                            <Text className="text-sm text-text-secondary">
                                Didn't receive OTP?{' '}
                            </Text>
                            <TouchableOpacity
                                onPress={handleResend}
                                disabled={!canResend}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                                <Text
                                    className={`text-sm font-semibold ${canResend ? 'text-brand-navy' : 'text-text-secondary'
                                        }`}
                                >
                                    {canResend ? 'Resend OTP' : `Resend in ${timerLabel}`}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {/* ── CTA Button ── */}
                        <TouchableOpacity
                            className={`rounded-lg py-4 items-center ${isComplete
                                    ? 'bg-brand-navy'
                                    : 'bg-brand-surface border border-brand-border'
                                }`}
                            onPress={handleVerify}
                            disabled={!isComplete}
                            activeOpacity={0.85}
                        >
                            <Text
                                className={`text-base font-semibold ${isComplete ? 'text-brand-white' : 'text-text-secondary'
                                    }`}
                            >
                                {/* FIX: was &amp; (HTML entity) — plain & is correct in JSX */}
                                Verify & Proceed
                            </Text>
                        </TouchableOpacity>

                    </View>
                </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
