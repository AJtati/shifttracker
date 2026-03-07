import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
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

export async function signUp({ fullName, email, password }: SignUpInput): Promise<User> {
  const authClient = getAuthClient();
  const credential = await createUserWithEmailAndPassword(authClient, email, password);
  await updateProfile(credential.user, { displayName: fullName });
  return credential.user;
}

export async function logIn(email: string, password: string): Promise<User> {
  const authClient = getAuthClient();
  const credential = await signInWithEmailAndPassword(authClient, email, password);
  return credential.user;
}

export async function logOut(): Promise<void> {
  const authClient = getAuthClient();
  await signOut(authClient);
}

export async function resetPassword(email: string): Promise<void> {
  const authClient = getAuthClient();
  await sendPasswordResetEmail(authClient, email);
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
