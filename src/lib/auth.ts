import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App singleton
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Configure Google Auth Provider with YouTube scopes
const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/youtube.upload');
provider.addScope('https://www.googleapis.com/auth/youtube.readonly');
provider.setCustomParameters({
  prompt: 'consent',
  access_type: 'offline',
});

let cachedAccessToken: string | null = null;
let isSigningIn = false;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user && cachedAccessToken) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else if (!isSigningIn) {
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const signInWithYouTube = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);

    if (!credential?.accessToken) {
      throw new Error('Failed to obtain YouTube OAuth access token from Google');
    }

    cachedAccessToken = credential.accessToken;

    // Send token to backend to securely connect YouTube channel
    const response = await fetch('/api/auth/save-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken: cachedAccessToken,
        user: {
          uid: result.user.uid,
          email: result.user.email,
          displayName: result.user.displayName,
          photoURL: result.user.photoURL,
        },
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to register YouTube connection with server');
    }

    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    if (
      error?.code === 'auth/popup-closed-by-user' ||
      error?.code === 'auth/cancelled-popup-request'
    ) {
      return null;
    }
    console.warn('YouTube sign-in notice:', error?.code || error?.message);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const logoutYouTube = async (): Promise<void> => {
  try {
    await signOut(auth);
    cachedAccessToken = null;
    await fetch('/api/auth/disconnect', { method: 'POST' });
  } catch (e) {
    console.error('Logout error:', e);
  }
};

export const getCachedAccessToken = (): string | null => {
  return cachedAccessToken;
};
