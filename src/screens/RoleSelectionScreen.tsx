import React, { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import {
    View,
    Text,
    TouchableOpacity,
    SafeAreaView,
    StatusBar,
    ActivityIndicator,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../store/store';
import { setAccountType } from '../store/authSlice';
import { supabase } from '../lib/supabase';

type Role = 'seeker' | 'provider';

export default function RoleSelectionScreen() {
    const dispatch = useDispatch<AppDispatch>();
    const session = useSelector((state: RootState) => state.auth.session);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleRoleSelect = useCallback(async (role: Role) => {
        if (loading || !session?.user) return;
        setLoading(true);
        setError('');

        try {
        const { error: upsertError } = await supabase
            .from('profiles')
            .upsert({
                id: session.user.id,
                email: session.user.email,
                account_type: role,
            }); 

            if (upsertError) throw upsertError;

            setLoading(false)
        
        // Dispatch updates Redux → AppNavigator auto-transitions to correct stack
        dispatch(setAccountType(role));
        // No navigation.navigate() needed — AppNavigator handles it via Redux state

        } catch(err:any){
            setLoading(false);
            setError(err.message);
            Alert.alert("Database Error", err.message);
        }
    }, [loading, session, dispatch]);

    return (
        <SafeAreaView className="flex-1 bg-brand-white">
            <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
            <View className="flex-1 justify-center px-6">

                {/* Header */}
                <View className="mb-12 items-center">
                    <View className="w-14 h-14 rounded-xl bg-brand-navy items-center justify-center mb-4">
                        <Text className="text-brand-white text-2xl font-bold">S</Text>
                    </View>
                    <Text className="text-2xl font-bold text-text-primary text-center">
                        How will you use Skill-Bridge?
                    </Text>
                    <Text className="mt-2 text-sm text-text-secondary text-center leading-5">
                        This helps us personalise your experience.{'\n'}You can't change this later.
                    </Text>
                </View>

                {/* Role Buttons */}
                <TouchableOpacity
                    className={`mb-4 rounded-lg py-5 px-6 border items-center ${loading ? 'bg-brand-surface border-brand-border' : 'bg-brand-navy border-brand-navy'
                        }`}
                    onPress={() => handleRoleSelect('seeker')}
                    disabled={loading}
                    activeOpacity={0.85}
                >
                    <Text className={`text-lg font-bold ${loading ? 'text-text-secondary' : 'text-brand-white'}`}>
                        I Need Services
                    </Text>
                    <Text className={`text-xs mt-1 ${loading ? 'text-text-secondary' : 'text-brand-white'}`}>
                        Find verified local professionals
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    className={`rounded-lg py-5 px-6 border items-center ${loading ? 'bg-brand-surface border-brand-border' : 'bg-brand-surface border-brand-border'
                        }`}
                    onPress={() => handleRoleSelect('provider')}
                    disabled={loading}
                    activeOpacity={0.85}
                >
                    <Text className={`text-lg font-bold ${loading ? 'text-text-secondary' : 'text-text-primary'}`}>
                        I Provide Services
                    </Text>
                    <Text className={`text-xs mt-1 ${loading ? 'text-text-secondary' : 'text-text-secondary'}`}>
                        Offer your skills to nearby seekers
                    </Text>
                </TouchableOpacity>

                {/* Loading indicator */}
                {loading && (
                    <View className="flex-row items-center justify-center mt-6">
                        <ActivityIndicator size="small" color="#0F172A" />
                        <Text className="ml-3 text-sm text-text-secondary">
                            Setting up your account…
                        </Text>
                    </View>
                )}

                {/* Error */}
                {error ? (
                    <Text className="mt-4 text-xs text-red-500 text-center">{error}</Text>
                ) : null}

            </View>
        </SafeAreaView>
    );
}
