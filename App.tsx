// NativeWind v4: global.css MUST be imported before any JSX
import './global.css';

import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider, useDispatch } from 'react-redux';
import { store, AppDispatch } from './src/store/store';
import AppNavigator from './src/navigation/AppNavigator';
import { supabase } from './src/lib/supabase';
import { setSession, setAccountType, setProfileComplete, clearAuth, setLoading } from './src/store/authSlice';

/**
 * AppInner — lives inside <Provider> so it can access Redux dispatch.
 * Sets up the Supabase auth state listener which:
 *  - Fires immediately on mount with the current session (from AsyncStorage)
 *  - Fires on every login / logout thereafter
 * This is what prevents the "login flash" on cold start for authenticated users.
 */
function AppInner() {
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session) {
          // Query profile BEFORE dispatching — prevents routing flash
          const { data: profile } = await supabase
            .from('profiles')
            .select('account_type, display_name')
            .eq('id', session.user.id)
            .single();

          // Dispatch all auth state atomically in one render cycle
          dispatch(setSession(session));
          if (profile?.account_type) {
            dispatch(setAccountType(profile.account_type as 'seeker' | 'provider'));
          }
          // profileComplete: true only when provider has completed setup (display_name set)
          dispatch(setProfileComplete(!!profile?.display_name));
        } else {
          // SIGNED_OUT or expired session
          dispatch(clearAuth());
        }

        // Always mark loading complete after first auth state resolves
        dispatch(setLoading(false));
      }
    );

    return () => subscription.unsubscribe();
  }, [dispatch]);

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

/**
 * App root — wraps AppInner in Redux Provider.
 * AppInner is separate because useDispatch requires being inside <Provider>.
 */
export default function App() {
  return (
    <Provider store={store}>
      <AppInner />
    </Provider>
  );
}
