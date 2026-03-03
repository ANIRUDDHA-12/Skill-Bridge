import React from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, StatusBar } from 'react-native';
import { supabase } from '../lib/supabase';

export default function ProviderTeaserDashboard() {
    const handleLogout = async () => {
        await supabase.auth.signOut();
        // onAuthStateChange in App.tsx automatically dispatches clearAuth()
    };

    return (
        <SafeAreaView className="flex-1 bg-brand-surface">
            <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
            <View className="flex-1 items-center justify-center px-6">
                {/* Role badge */}
                <View className="mb-4 px-4 py-1.5 rounded-full bg-brand-emerald">
                    <Text className="text-brand-white text-xs font-semibold tracking-widest uppercase">
                        Provider
                    </Text>
                </View>

                <Text className="text-2xl font-bold text-text-primary mb-2 text-center">
                    Provider Job Feed
                </Text>
                <Text className="text-sm text-text-secondary text-center mb-12">
                    Phase 5 — Job alerts and bookings coming here
                </Text>

                {/* Logout */}
                <TouchableOpacity
                    className="bg-brand-navy rounded-lg px-8 py-3.5"
                    onPress={handleLogout}
                    activeOpacity={0.85}
                >
                    <Text className="text-brand-white text-sm font-semibold">
                        Sign Out
                    </Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}
