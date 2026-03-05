import React, { useState, useEffect } from 'react';
import {
    Modal,
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
} from 'react-native';

// ── Props ──────────────────────────────────────────────────────────────────────

interface PinModalProps {
    visible: boolean;
    onSubmit: (pin: string) => void;
    onCancel: () => void;
    error: string | null;
    loading: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Cross-platform 4-digit PIN entry modal.
 * Used by ProviderJobFeedScreen for the Doorstep PIN handshake.
 * Replaces Alert.prompt (iOS-only).
 */
export default function PinModal({ visible, onSubmit, onCancel, error, loading }: PinModalProps) {
    const [pin, setPin] = useState('');

    // Reset pin each time the modal opens
    useEffect(() => {
        if (visible) setPin('');
    }, [visible]);

    const handleConfirm = () => {
        if (pin.length !== 4 || loading) return;
        onSubmit(pin.trim());
    };

    const isConfirmEnabled = pin.length === 4 && !loading;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onCancel}
        >
            {/* Scrim */}
            <KeyboardAvoidingView
                style={styles.scrim}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <TouchableOpacity
                    style={StyleSheet.absoluteFill}
                    activeOpacity={1}
                    onPress={onCancel}
                />

                {/* Card */}
                <View style={styles.card}>
                    {/* Title */}
                    <Text style={styles.title}>Enter Doorstep PIN</Text>
                    <Text style={styles.subtitle}>
                        Ask the Seeker for their 4-digit PIN to start the job.
                    </Text>

                    {/* PIN Input */}
                    <TextInput
                        style={[styles.pinInput, error ? styles.pinInputError : null]}
                        value={pin}
                        onChangeText={text => setPin(text.replace(/\D/g, '').slice(0, 4))}
                        keyboardType="number-pad"
                        maxLength={4}
                        placeholder="• • • •"
                        placeholderTextColor="#94A3B8"
                        textAlign="center"
                        autoFocus
                        onSubmitEditing={handleConfirm}
                    />

                    {/* Inline error */}
                    {error ? (
                        <Text style={styles.errorText}>{error}</Text>
                    ) : null}

                    {/* Buttons */}
                    <View style={styles.buttonRow}>
                        <TouchableOpacity
                            style={styles.cancelBtn}
                            onPress={onCancel}
                            activeOpacity={0.7}
                            disabled={loading}
                        >
                            <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.confirmBtn, !isConfirmEnabled && styles.confirmBtnDisabled]}
                            onPress={handleConfirm}
                            activeOpacity={0.85}
                            disabled={!isConfirmEnabled}
                        >
                            {loading ? (
                                <ActivityIndicator color="#FFFFFF" size="small" />
                            ) : (
                                <Text style={styles.confirmText}>Confirm</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    scrim: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    card: {
        width: '100%',
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.15,
                shadowRadius: 16,
            },
            android: { elevation: 12 },
        }),
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        color: '#0F172A',
        marginBottom: 6,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 13,
        color: '#64748B',
        textAlign: 'center',
        marginBottom: 20,
        lineHeight: 18,
    },
    pinInput: {
        width: '100%',
        borderWidth: 2,
        borderColor: '#E2E8F0',
        borderRadius: 14,
        paddingVertical: 14,
        fontSize: 28,
        fontWeight: '700',
        color: '#0F172A',
        letterSpacing: 12,
        marginBottom: 8,
        backgroundColor: '#F8FAFC',
    },
    pinInputError: {
        borderColor: '#EF4444',
    },
    errorText: {
        fontSize: 12,
        color: '#EF4444',
        marginBottom: 16,
        textAlign: 'center',
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 8,
        width: '100%',
    },
    cancelBtn: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 12,
        paddingVertical: 13,
        alignItems: 'center',
    },
    cancelText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#64748B',
    },
    confirmBtn: {
        flex: 1,
        backgroundColor: '#0F172A',
        borderRadius: 12,
        paddingVertical: 13,
        alignItems: 'center',
    },
    confirmBtnDisabled: {
        backgroundColor: '#E2E8F0',
    },
    confirmText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#FFFFFF',
    },
});
