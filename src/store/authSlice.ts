import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Session } from '@supabase/supabase-js';

interface AuthState {
    session: Session | null;
    accountType: 'seeker' | 'provider' | null;
    profileComplete: boolean; // true when provider has display_name set — drives setup screen routing
    isLoading: boolean; // true during initial session restore — prevents auth flash
}

const initialState: AuthState = {
    session: null,
    accountType: null,
    profileComplete: false,
    isLoading: true, // starts true — set false after onAuthStateChange fires
};

const authSlice = createSlice({
    name: 'auth',
    initialState,
    reducers: {
        setSession(state, action: PayloadAction<Session>) {
            state.session = action.payload;
        },
        setAccountType(state, action: PayloadAction<'seeker' | 'provider'>) {
            state.accountType = action.payload;
        },
        setProfileComplete(state, action: PayloadAction<boolean>) {
            state.profileComplete = action.payload;
        },
        clearAuth(state) {
            state.session = null;
            state.accountType = null;
            state.profileComplete = false;
        },
        setLoading(state, action: PayloadAction<boolean>) {
            state.isLoading = action.payload;
        },
    },
});

export const { setSession, setAccountType, setProfileComplete, clearAuth, setLoading } = authSlice.actions;
export default authSlice.reducer;
