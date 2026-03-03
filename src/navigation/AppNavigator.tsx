import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/LoginScreen';
import OtpScreen from '../screens/OtpScreen';

// ── Route param types ──
export type RootStackParamList = {
    Login: undefined;
    Otp: { phone: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
    return (
        <Stack.Navigator
            initialRouteName="Login"
            screenOptions={{
                headerShown: false,      // Both screens manage their own headers
                animation: 'slide_from_right',
                contentStyle: { backgroundColor: '#FFFFFF' },
            }}
        >
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Otp" component={OtpScreen} />
        </Stack.Navigator>
    );
}
