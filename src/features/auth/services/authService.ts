import {
  ActionCodeSettings,
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";

import { auth } from "@/services/firebase/client";
import { FirebaseConfigError } from "@/services/firebase/errors";

export interface SignUpInput {
  fullName: string;
  email: string;
  password: string;
}

function getAuthClient() {
  if (!auth) {
    throw new FirebaseConfigError();
  }

  return auth;
}

function getConfiguredBaseUrl(): string | null {
  const explicitAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicitAppUrl) {
    return explicitAppUrl.replace(/\/$/, "");
  }

  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin;
  }

  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim();
  if (!authDomain) {
    return null;
  }

  const normalizedDomain = authDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `https://${normalizedDomain}`;
}

function getAuthActionCodeSettings(): ActionCodeSettings | undefined {
  const baseUrl = getConfiguredBaseUrl();
  if (!baseUrl) {
    return undefined;
  }

  return {
    url: `${baseUrl}/login`,
    handleCodeInApp: false,
  };
}

function hasPasswordProvider(user: User): boolean {
  return user.providerData.some((provider) => provider.providerId === "password");
}

export async function sendVerificationEmail(user?: User): Promise<void> {
  const authClient = getAuthClient();
  const targetUser = user ?? authClient.currentUser;

  if (!targetUser) {
    throw new Error("No authenticated user to verify.");
  }

  await sendEmailVerification(targetUser, getAuthActionCodeSettings());
}

export async function signUp({ fullName, email, password }: SignUpInput): Promise<User> {
  const authClient = getAuthClient();
  const credential = await createUserWithEmailAndPassword(authClient, email, password);
  await updateProfile(credential.user, { displayName: fullName });

  try {
    await sendVerificationEmail(credential.user);
  } finally {
    await signOut(authClient);
  }

  return credential.user;
}

export async function logIn(email: string, password: string): Promise<User> {
  const authClient = getAuthClient();
  const credential = await signInWithEmailAndPassword(authClient, email, password);

  if (hasPasswordProvider(credential.user) && !credential.user.emailVerified) {
    await sendVerificationEmail(credential.user);
    await signOut(authClient);
    throw new Error("Please verify your email first. We sent a new verification email.");
  }

  return credential.user;
}

export async function resendVerificationEmail(email: string, password: string): Promise<void> {
  const authClient = getAuthClient();
  const credential = await signInWithEmailAndPassword(authClient, email, password);

  try {
    if (credential.user.emailVerified) {
      return;
    }

    await sendVerificationEmail(credential.user);
  } finally {
    await signOut(authClient);
  }
}

export async function logOut(): Promise<void> {
  const authClient = getAuthClient();
  await signOut(authClient);
}

export async function resetPassword(email: string): Promise<void> {
  const authClient = getAuthClient();
  await sendPasswordResetEmail(authClient, email, getAuthActionCodeSettings());
}

export async function updateAuthDisplayName(fullName: string): Promise<void> {
  const authClient = getAuthClient();

  if (!authClient.currentUser) {
    throw new Error("No authenticated user to update.");
  }

  await updateProfile(authClient.currentUser, { displayName: fullName });
}

export function subscribeToAuthChanges(callback: (user: User | null) => void): () => void {
  const authClient = getAuthClient();
  return onAuthStateChanged(authClient, callback);
}
