"use client";

import { User } from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { logIn, logOut, resetPassword, signUp, subscribeToAuthChanges } from "@/features/auth/services/authService";
import { toFriendlyAuthError } from "@/features/auth/utils/errorMessage";
import { ensureUserProfile, getUserProfile } from "@/features/user/services/userService";
import { hasFirebaseConfig } from "@/services/firebase/client";
import { isFirestoreSetupError } from "@/services/firebase/errors";
import { UserProfile } from "@/types/user";
import { DEFAULT_PREFERENCES } from "@/utils/constants";

interface SignUpPayload {
  fullName: string;
  email: string;
  password: string;
}

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  hasFirebaseConfig: boolean;
  authError: string | null;
  firebaseWarning: string | null;
  clearAuthError: () => void;
  signUpWithEmail: (payload: SignUpPayload) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const FIREBASE_CONFIG_ERROR =
  "Firebase is not configured. Add NEXT_PUBLIC_FIREBASE_* variables to run authentication and Firestore features.";
const THEME_STORAGE_KEY = "shifttracker:v1:theme";

function isThemePreference(value: string | null): value is "light" | "dark" {
  return value === "light" || value === "dark";
}

function applyTheme(theme: "light" | "dark") {
  if (typeof document === "undefined") {
    return;
  }

  const rootElement = document.documentElement;
  rootElement.classList.remove("theme-light", "theme-dark");
  rootElement.classList.add(theme === "light" ? "theme-light" : "theme-dark");
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(hasFirebaseConfig);
  const [authError, setAuthError] = useState<string | null>(hasFirebaseConfig ? null : FIREBASE_CONFIG_ERROR);
  const [firebaseWarning, setFirebaseWarning] = useState<string | null>(null);

  const fallbackProfileFromAuth = useCallback((currentUser: User): UserProfile => {
    const now = new Date().toISOString();

    return {
      uid: currentUser.uid,
      fullName: currentUser.displayName ?? "User",
      email: currentUser.email ?? "",
      createdAt: now,
      updatedAt: now,
      defaultView: DEFAULT_PREFERENCES.defaultView,
      weekStartsOn: DEFAULT_PREFERENCES.weekStartsOn,
      timeFormat: DEFAULT_PREFERENCES.timeFormat,
      theme: DEFAULT_PREFERENCES.theme,
      timezone: DEFAULT_PREFERENCES.timezone,
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    applyTheme(isThemePreference(storedTheme) ? storedTheme : DEFAULT_PREFERENCES.theme);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const themePreference = profile?.theme;

    if (!themePreference) {
      return;
    }

    window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
    applyTheme(themePreference);
  }, [profile?.theme]);

  const loadUserProfile = useCallback(async (uid: string) => {
    const userProfile = await getUserProfile(uid);
    setProfile(userProfile);
    return userProfile;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) {
      return;
    }

    await loadUserProfile(user.uid);
  }, [loadUserProfile, user]);

  useEffect(() => {
    if (!hasFirebaseConfig) {
      return;
    }

    let active = true;

    const hydrateProfile = async (currentUser: User) => {
      try {
        await ensureUserProfile({
          uid: currentUser.uid,
          fullName: currentUser.displayName ?? "User",
          email: currentUser.email ?? "",
        });

        if (!active) {
          return;
        }

        const loadedProfile = await loadUserProfile(currentUser.uid);

        if (!loadedProfile) {
          setProfile((existingProfile) => existingProfile ?? fallbackProfileFromAuth(currentUser));
        }
      } catch (error) {
        if (!active) {
          return;
        }

        // Keep login successful even when Firestore profile bootstrap is unavailable.
        setProfile((existingProfile) => existingProfile ?? fallbackProfileFromAuth(currentUser));
        setFirebaseWarning(
          isFirestoreSetupError(error)
            ? "Cloud Firestore is not enabled yet. Cloud data features are unavailable."
            : "Cloud sync is unavailable right now. Please try again shortly.",
        );
      }
    };

    const unsubscribe = subscribeToAuthChanges(async (currentUser) => {
      if (!active) {
        return;
      }

      setUser(currentUser);
      setAuthError(null);
      setFirebaseWarning(null);

      if (!currentUser) {
        setProfile(null);
        setIsLoading(false);
        return;
      }

      // Do not block login/signup UX on Firestore profile bootstrap.
      setIsLoading(false);
      void hydrateProfile(currentUser);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [fallbackProfileFromAuth, loadUserProfile]);

  const signUpWithEmail = useCallback(async ({ fullName, email, password }: SignUpPayload) => {
    setAuthError(null);

    try {
      const newUser = await signUp({ fullName, email, password });
      setUser(newUser);
      setIsLoading(false);
      setProfile((existingProfile) => existingProfile ?? fallbackProfileFromAuth(newUser));
    } catch (error) {
      const message = toFriendlyAuthError(error);
      setAuthError(message);
      throw new Error(message);
    }
  }, [fallbackProfileFromAuth]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    setAuthError(null);

    try {
      const loggedInUser = await logIn(email, password);
      setUser(loggedInUser);
      setIsLoading(false);
      setProfile((existingProfile) => existingProfile ?? fallbackProfileFromAuth(loggedInUser));
    } catch (error) {
      const message = toFriendlyAuthError(error);
      setAuthError(message);
      throw new Error(message);
    }
  }, [fallbackProfileFromAuth]);

  const signOutUser = useCallback(async () => {
    setAuthError(null);

    try {
      await logOut();
      setProfile(null);
      setUser(null);
      setFirebaseWarning(null);
    } catch (error) {
      const message = toFriendlyAuthError(error);
      setAuthError(message);
      throw new Error(message);
    }
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    setAuthError(null);

    try {
      await resetPassword(email);
    } catch (error) {
      const message = toFriendlyAuthError(error);
      setAuthError(message);
      throw new Error(message);
    }
  }, []);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      profile,
      isLoading,
      hasFirebaseConfig,
      authError,
      firebaseWarning,
      clearAuthError,
      signUpWithEmail,
      signInWithEmail,
      signOutUser,
      sendPasswordReset,
      refreshProfile,
    }),
    [
      authError,
      clearAuthError,
      firebaseWarning,
      isLoading,
      profile,
      refreshProfile,
      sendPasswordReset,
      signInWithEmail,
      signOutUser,
      signUpWithEmail,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuthContext must be used within AuthProvider");
  }

  return context;
}
