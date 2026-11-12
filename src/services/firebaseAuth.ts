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

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.readonly');
provider.addScope('https://www.googleapis.com/auth/drive.file');

// Allowed curator/admin email whitelist
export const ALLOWED_ADMIN_EMAIL =
  (import.meta as any).env?.VITE_ADMIN_EMAIL || 'iamcoolkorean@gmail.com';

/**
 * Validates whether an authenticated Google user's email matches the curator admin whitelist.
 */
export const isAuthorizedAdmin = (email?: string | null): boolean => {
  if (!email) return false;
  return email.trim().toLowerCase() === ALLOWED_ADMIN_EMAIL.trim().toLowerCase();
};

// In-memory token cache (strictly NO localStorage or sessionStorage as required by Workspace integration guidelines)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

/**
 * Initializes authentication state observer with admin authorization check.
 */
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      // If user is not the authorized admin, reject and sign out immediately
      if (!isAuthorizedAdmin(user.email)) {
        await logout();
        if (onAuthFailure) onAuthFailure();
        return;
      }

      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * Initiates Google Sign-In with popup to request Google Drive scopes.
 * Rejects any Google account not matching the administrator whitelist.
 */
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to retrieve access token from Google Auth Provider');
    }

    // Verify authorized administrator email
    if (!isAuthorizedAdmin(result.user.email)) {
      await logout();
      throw new Error(
        `Access denied. Google account "${result.user.email || 'unknown'}" is not authorized as curator administrator.`
      );
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Google Sign In Error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Returns the currently active in-memory access token.
 */
export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

/**
 * Sets access token manually if supplied from direct auth response
 */
export const setCachedAccessToken = (token: string | null) => {
  cachedAccessToken = token;
};

/**
 * Signs the user out and clears the in-memory access token and admin session state.
 */
export const logout = async () => {
  try {
    await signOut(auth);
  } finally {
    cachedAccessToken = null;
    isSigningIn = false;
    try {
      sessionStorage.removeItem('jwy_admin_password_verified');
      sessionStorage.removeItem('jwy_gh_pat_session');
    } catch (_) {}
  }
};
