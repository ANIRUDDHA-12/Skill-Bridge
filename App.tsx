// NativeWind v4: global.css MUST be imported before any JSX
import './global.css';

import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider, useDispatch } from 'react-redux';
import { store, AppDispatch } from './src/store/store';
import AppNavigator from './src/navigation/AppNavigator';
import { supabase } from './src/lib/supabase';
import { setSession, setAccountType, clearAuth, setLoading } from './src/store/authSlice';

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
          dispatch(setSession(session));

          // Query profiles to restore accountType
          const { data: profile } = await supabase
            .from('profiles')
            .select('account_type')
            .eq('id', session.user.id)
            .single();

          if (profile?.account_type) {
            dispatch(setAccountType(profile.account_type as 'seeker' | 'provider'));
          }
          // If no profile (new user): accountType stays null → SetupStack
        } else {
          // SIGNED_OUT or no session
          dispatch(clearAuth());
        }

        // Always set loading false after first auth state is known
        dispatch(setLoading(false));
      }
    );

    // Cleanup listener on unmount
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
