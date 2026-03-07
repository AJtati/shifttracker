import { RotaEntry } from "@/types/entry";
import { UserProfile } from "@/types/user";

const STORAGE_PREFIX = "shifttracker:v1";

function isBrowserEnvironment(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function safeRead<T>(key: string, fallback: T): T {
  if (!isBrowserEnvironment()) {
    return fallback;
  }

  try {
    const rawValue = window.localStorage.getItem(key);

    if (!rawValue) {
      return fallback;
    }

    return JSON.parse(rawValue) as T;
  } catch {
    return fallback;
  }
}

function safeWrite<T>(key: string, value: T): void {
  if (!isBrowserEnvironment()) {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage write errors to avoid breaking app flow.
  }
}

function safeDelete(key: string): void {
  if (!isBrowserEnvironment()) {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage delete errors to avoid breaking app flow.
  }
}

function profileKey(uid: string): string {
  return `${STORAGE_PREFIX}:profile:${uid}`;
}

function entriesKey(uid: string): string {
  return `${STORAGE_PREFIX}:entries:${uid}`;
}

export function getLocalProfile(uid: string): UserProfile | null {
  return safeRead<UserProfile | null>(profileKey(uid), null);
}

export function setLocalProfile(profile: UserProfile): void {
  safeWrite(profileKey(profile.uid), profile);
}

export function clearLocalProfile(uid: string): void {
  safeDelete(profileKey(uid));
}

export function getLocalEntries(uid: string): RotaEntry[] {
  const entries = safeRead<RotaEntry[]>(entriesKey(uid), []);

  if (!Array.isArray(entries)) {
    return [];
  }

  return entries;
}

export function setLocalEntries(uid: string, entries: RotaEntry[]): void {
  safeWrite(entriesKey(uid), entries);
}

export function mergeLocalEntries(uid: string, entries: RotaEntry[]): RotaEntry[] {
  const existingEntries = getLocalEntries(uid);
  const entryMap = new Map(existingEntries.map((entry) => [entry.id, entry]));

  entries.forEach((entry) => {
    entryMap.set(entry.id, entry);
  });

  const mergedEntries = Array.from(entryMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  setLocalEntries(uid, mergedEntries);

  return mergedEntries;
}

export function upsertLocalEntry(uid: string, entry: RotaEntry): void {
  mergeLocalEntries(uid, [entry]);
}

export function removeLocalEntry(uid: string, entryId: string): void {
  const existingEntries = getLocalEntries(uid);
  const nextEntries = existingEntries.filter((entry) => entry.id !== entryId);
  setLocalEntries(uid, nextEntries);
}
