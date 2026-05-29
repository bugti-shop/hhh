// Native Apple Sign-In for iOS (Capacitor 5). Falls back to web OAuth on non-native.
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabase';

export const isNativeApple = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

/**
 * Run native "Sign in with Apple" on iOS and exchange the identity token
 * for a Supabase session. Returns the Supabase user on success.
 */
export const signInWithAppleNative = async () => {
  // Indirect specifier so Vite's web build doesn't try to resolve the native plugin.
  const mod: any = await import(
    /* @vite-ignore */ ('@capacitor-community/' + 'apple-sign-in') as string
  );
  const SignInWithApple = mod.SignInWithApple || mod.default?.SignInWithApple || mod;

  const options = {
    clientId: 'com.flowist.app.signin', // Apple Services ID
    redirectURI: 'https://flowist.me/~oauth/callback',
    scopes: 'email name',
    state: '',
    nonce: Math.random().toString(36).slice(2),
  };

  const response = await SignInWithApple.authorize(options);
  const r = response?.response ?? response;
  const identityToken: string | undefined = r?.identityToken;
  if (!identityToken) throw new Error('No identity token from Apple Sign-In');

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: identityToken,
    nonce: options.nonce,
  });
  if (error) throw error;
  return data.user;
};
