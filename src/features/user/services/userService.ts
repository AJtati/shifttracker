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

function isValidTimeValue(value: unknown): value is string {
  return typeof value === "string" && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value);
}

function normalizeReminderTime(value: unknown, fallback: string): string {
  return isValidTimeValue(value) ? value : fallback;
}

function normalizeShiftReminderValue(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_PREFERENCES.shiftReminderValue;
  }

  const roundedValue = Math.round(value);
  return Math.min(10080, Math.max(1, roundedValue));
}

function normalizePreferences(preferences: UserPreferences): UserPreferences {
  return {
    ...preferences,
    timezone: preferences.timezone.trim() || DEFAULT_PREFERENCES.timezone,
    shiftReminderValue: normalizeShiftReminderValue(preferences.shiftReminderValue),
    dayBeforeReminderTime: normalizeReminderTime(
      preferences.dayBeforeReminderTime,
      DEFAULT_PREFERENCES.dayBeforeReminderTime,
    ),
    holidayLeaveReminderTime: normalizeReminderTime(
      preferences.holidayLeaveReminderTime,
      DEFAULT_PREFERENCES.holidayLeaveReminderTime,
    ),
  };
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
    shiftReminderEnabled: DEFAULT_PREFERENCES.shiftReminderEnabled,
    shiftReminderValue: DEFAULT_PREFERENCES.shiftReminderValue,
    shiftReminderUnit: DEFAULT_PREFERENCES.shiftReminderUnit,
    dayBeforeReminderEnabled: DEFAULT_PREFERENCES.dayBeforeReminderEnabled,
    dayBeforeReminderTime: DEFAULT_PREFERENCES.dayBeforeReminderTime,
    holidayLeaveReminderEnabled: DEFAULT_PREFERENCES.holidayLeaveReminderEnabled,
    holidayLeaveReminderTime: DEFAULT_PREFERENCES.holidayLeaveReminderTime,
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
    shiftReminderEnabled: DEFAULT_PREFERENCES.shiftReminderEnabled,
    shiftReminderValue: DEFAULT_PREFERENCES.shiftReminderValue,
    shiftReminderUnit: DEFAULT_PREFERENCES.shiftReminderUnit,
    dayBeforeReminderEnabled: DEFAULT_PREFERENCES.dayBeforeReminderEnabled,
    dayBeforeReminderTime: DEFAULT_PREFERENCES.dayBeforeReminderTime,
    holidayLeaveReminderEnabled: DEFAULT_PREFERENCES.holidayLeaveReminderEnabled,
    holidayLeaveReminderTime: DEFAULT_PREFERENCES.holidayLeaveReminderTime,
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
    shiftReminderEnabled:
      typeof data.shiftReminderEnabled === "boolean"
        ? data.shiftReminderEnabled
        : DEFAULT_PREFERENCES.shiftReminderEnabled,
    shiftReminderValue: normalizeShiftReminderValue(data.shiftReminderValue),
    shiftReminderUnit: data.shiftReminderUnit === "hours" ? "hours" : "minutes",
    dayBeforeReminderEnabled:
      typeof data.dayBeforeReminderEnabled === "boolean"
        ? data.dayBeforeReminderEnabled
        : DEFAULT_PREFERENCES.dayBeforeReminderEnabled,
    dayBeforeReminderTime: normalizeReminderTime(data.dayBeforeReminderTime, DEFAULT_PREFERENCES.dayBeforeReminderTime),
    holidayLeaveReminderEnabled:
      typeof data.holidayLeaveReminderEnabled === "boolean"
        ? data.holidayLeaveReminderEnabled
        : DEFAULT_PREFERENCES.holidayLeaveReminderEnabled,
    holidayLeaveReminderTime: normalizeReminderTime(
      data.holidayLeaveReminderTime,
      DEFAULT_PREFERENCES.holidayLeaveReminderTime,
    ),
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
  const normalizedPreferences = normalizePreferences(preferences);
  const currentProfile = getLocalProfile(uid);
  const now = new Date().toISOString();
  const baseProfile = currentProfile ?? buildFallbackProfile(uid);
  const nextProfile = { ...baseProfile, ...normalizedPreferences, updatedAt: now };

  try {
    const dbClient = getDbClient();
    const userRef = doc(dbClient, "users", uid);

    await runFirestoreWrite(
      () =>
        setDoc(
          userRef,
          {
            ...normalizedPreferences,
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
