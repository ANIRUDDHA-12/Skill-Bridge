import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Skill-Bridge Supabase Client
 * Uses AsyncStorage for session persistence so the user stays logged in
 * across app restarts without re-entering credentials.
 */
export const supabase = createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL!,
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
    {
        auth: {
            storage: AsyncStorage,
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false, // Required for React Native (no URL scheme)
        },
    }
);
