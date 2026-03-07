import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { db } from "@/services/firebase/client";
import {
  FirebaseConfigError,
  isRecoverableFirebaseError,
  toFirebaseAppError,
} from "@/services/firebase/errors";
import { getLocalProfile, setLocalProfile } from "@/services/firebase/localData";
import { runFirestoreRead, runFirestoreWrite } from "@/services/firebase/request";
import { UserPreferences, UserProfile } from "@/types/user";
import { DEFAULT_PREFERENCES } from "@/utils/constants";
import { toIsoTimestamp } from "@/utils/firestore";

interface CreateUserProfileInput {
  uid: string;
  fullName: string;
  email: string;
}

export interface UpdateUserProfileDetailsInput {
  fullName: string;
}

function getDbClient() {
  if (!db) {
    throw new FirebaseConfigError();
  }

  return db;
}

function buildProfile(input: CreateUserProfileInput): UserProfile {
  const now = new Date().toISOString();

  return {
    uid: input.uid,
    fullName: input.fullName,
    email: input.email,
    createdAt: now,
    updatedAt: now,
    defaultView: DEFAULT_PREFERENCES.defaultView,
    weekStartsOn: DEFAULT_PREFERENCES.weekStartsOn,
    timeFormat: DEFAULT_PREFERENCES.timeFormat,
    theme: DEFAULT_PREFERENCES.theme,
    timezone: DEFAULT_PREFERENCES.timezone,
  };
}

function buildFallbackProfile(uid: string): UserProfile {
  const now = new Date().toISOString();

  return {
    uid,
    fullName: "User",
    email: "",
    createdAt: now,
    updatedAt: now,
    defaultView: DEFAULT_PREFERENCES.defaultView,
    weekStartsOn: DEFAULT_PREFERENCES.weekStartsOn,
    timeFormat: DEFAULT_PREFERENCES.timeFormat,
    theme: DEFAULT_PREFERENCES.theme,
    timezone: DEFAULT_PREFERENCES.timezone,
  };
}

function toUserProfile(uid: string, data: Record<string, unknown>): UserProfile {
  return {
    uid,
    fullName: typeof data.fullName === "string" ? data.fullName : "",
    email: typeof data.email === "string" ? data.email : "",
    createdAt: toIsoTimestamp(data.createdAt),
    updatedAt: toIsoTimestamp(data.updatedAt),
    defaultView:
      data.defaultView === "dashboard" ||
      data.defaultView === "weekly" ||
      data.defaultView === "monthly" ||
      data.defaultView === "list"
        ? data.defaultView
        : DEFAULT_PREFERENCES.defaultView,
    weekStartsOn: data.weekStartsOn === "sunday" ? "sunday" : "monday",
    timeFormat: data.timeFormat === "12h" ? "12h" : "24h",
    theme: data.theme === "light" ? "light" : DEFAULT_PREFERENCES.theme,
    timezone: typeof data.timezone === "string" ? data.timezone : DEFAULT_PREFERENCES.timezone,
  };
}

export async function createUserProfile({ uid, fullName, email }: CreateUserProfileInput): Promise<void> {
  const localProfile = buildProfile({ uid, fullName, email });

  try {
    const dbClient = getDbClient();
    const userRef = doc(dbClient, "users", uid);

    await runFirestoreWrite(
      () =>
        setDoc(
          userRef,
          {
            uid,
            fullName,
            email,
            ...DEFAULT_PREFERENCES,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        ),
      "Unable to create user profile.",
    );
  } catch (error) {
    throw toFirebaseAppError(error, "Unable to create user profile.");
  }

  setLocalProfile(localProfile);
}

export async function ensureUserProfile({ uid, fullName, email }: CreateUserProfileInput): Promise<void> {
  const profile = await getUserProfile(uid);

  if (profile) {
    return;
  }

  await createUserProfile({ uid, fullName, email });
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const localProfile = getLocalProfile(uid);

  try {
    const dbClient = getDbClient();
    const userRef = doc(dbClient, "users", uid);
    const snapshot = await runFirestoreRead(() => getDoc(userRef), "Unable to load user profile.");

    if (!snapshot.exists()) {
      return localProfile;
    }

    const remoteProfile = toUserProfile(uid, snapshot.data());
    setLocalProfile(remoteProfile);

    return remoteProfile;
  } catch (error) {
    if (localProfile) {
      return localProfile;
    }

    if (isRecoverableFirebaseError(error)) {
      return null;
    }

    throw toFirebaseAppError(error, "Unable to load user profile.");
  }
}

export async function updatePreferences(uid: string, preferences: UserPreferences): Promise<void> {
  const currentProfile = getLocalProfile(uid);
  const now = new Date().toISOString();
  const baseProfile = currentProfile ?? buildFallbackProfile(uid);
  const nextProfile = { ...baseProfile, ...preferences, updatedAt: now };

  try {
    const dbClient = getDbClient();
    const userRef = doc(dbClient, "users", uid);

    await runFirestoreWrite(
      () =>
        setDoc(
          userRef,
          {
          ...preferences,
          updatedAt: serverTimestamp(),
          },
          { merge: true },
        ),
      "Unable to update profile preferences.",
    );
  } catch (error) {
    throw toFirebaseAppError(error, "Unable to update profile preferences.");
  }

  setLocalProfile(nextProfile);
}

export async function updateUserProfileDetails(
  uid: string,
  details: UpdateUserProfileDetailsInput,
): Promise<void> {
  const currentProfile = getLocalProfile(uid);
  const now = new Date().toISOString();
  const baseProfile = currentProfile ?? buildFallbackProfile(uid);
  const nextProfile = {
    ...baseProfile,
    fullName: details.fullName.trim() || baseProfile.fullName,
    updatedAt: now,
  };

  try {
    const dbClient = getDbClient();
    const userRef = doc(dbClient, "users", uid);

    await runFirestoreWrite(
      () =>
        setDoc(
          userRef,
          {
          fullName: details.fullName.trim(),
          updatedAt: serverTimestamp(),
          },
          { merge: true },
        ),
      "Unable to update profile details.",
    );
  } catch (error) {
    throw toFirebaseAppError(error, "Unable to update profile details.");
  }

  setLocalProfile(nextProfile);
}
