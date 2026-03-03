import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSelector } from 'react-redux';
import { RootState } from '../store/store';

// ── Screen imports ──
import LoginScreen from '../screens/LoginScreen';
import OtpScreen from '../screens/OtpScreen';
import RoleSelectionScreen from '../screens/RoleSelectionScreen';
import SeekerMapDashboard from '../screens/SeekerMapDashboard';
import ProviderTeaserDashboard from '../screens/ProviderTeaserDashboard';

// ── Typed param lists per stack ──
export type AuthStackParamList = {
    Login: undefined;
    Otp: { email: string };
};

export type SetupStackParamList = {
    RoleSelection: undefined;
};

export type SeekerStackParamList = {
    SeekerMapDashboard: undefined;
};

export type ProviderStackParamList = {
    ProviderTeaserDashboard: undefined;
};

// ── Stack navigators ──
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const SetupStack = createNativeStackNavigator<SetupStackParamList>();
const SeekerStack = createNativeStackNavigator<SeekerStackParamList>();
const ProviderStack = createNativeStackNavigator<ProviderStackParamList>();

const SCREEN_OPTIONS = {
    headerShown: false,
    animation: 'slide_from_right' as const,
    contentStyle: { backgroundColor: '#FFFFFF' },
};

function AuthNavigator() {
    return (
        <AuthStack.Navigator screenOptions={SCREEN_OPTIONS}>
            <AuthStack.Screen name="Login" component={LoginScreen} />
            <AuthStack.Screen name="Otp" component={OtpScreen} />
        </AuthStack.Navigator>
    );
}

function SetupNavigator() {
    return (
        <SetupStack.Navigator screenOptions={{ ...SCREEN_OPTIONS, animation: 'fade' }}>
            <SetupStack.Screen name="RoleSelection" component={RoleSelectionScreen} />
        </SetupStack.Navigator>
    );
}

function SeekerNavigator() {
    return (
        <SeekerStack.Navigator screenOptions={{ ...SCREEN_OPTIONS, contentStyle: { backgroundColor: '#F8FAFC' } }}>
            <SeekerStack.Screen name="SeekerMapDashboard" component={SeekerMapDashboard} />
        </SeekerStack.Navigator>
    );
}

function ProviderNavigator() {
    return (
        <ProviderStack.Navigator screenOptions={{ ...SCREEN_OPTIONS, contentStyle: { backgroundColor: '#F8FAFC' } }}>
            <ProviderStack.Screen name="ProviderTeaserDashboard" component={ProviderTeaserDashboard} />
        </ProviderStack.Navigator>
    );
}

// ── Root: reads Redux and renders the correct stack ──
export default function AppNavigator() {
    const { session, accountType, isLoading } = useSelector(
        (state: RootState) => state.auth
    );

    // Show loading screen while onAuthStateChange restores the session
    if (isLoading) {
        return (
            <View style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="large" color="#0F172A" />
            </View>
        );
    }

    // Conditional stack rendering based on auth state
    if (!session) return <AuthNavigator />;
    if (!accountType) return <SetupNavigator />;
    if (accountType === 'seeker') return <SeekerNavigator />;
    return <ProviderNavigator />;
}
