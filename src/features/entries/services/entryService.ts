import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
  where,
} from "firebase/firestore";
import { deleteObject, ref as storageRef, uploadString } from "firebase/storage";

import { db, storage } from "@/services/firebase/client";
import {
  FirebaseConfigError,
  toFirebaseAppError,
} from "@/services/firebase/errors";
import { runFirestoreRead, runFirestoreWrite } from "@/services/firebase/request";
import { EntryType, RotaEntry, RotaEntryFilters, RotaEntryInput } from "@/types/entry";
import { ENTRY_TYPE_COLOR, ENTRY_TYPE_LABEL, VALID_ENTRY_TYPES } from "@/utils/constants";
import { toDateKey } from "@/utils/date";
import { toIsoTimestamp } from "@/utils/firestore";

const ENTRIES_CACHE_TTL_MS = 45_000;

interface CachedEntries {
  data: RotaEntry[];
  expiresAt: number;
}

const entriesRangeCache = new Map<string, CachedEntries>();
const FIRESTORE_IN_QUERY_LIMIT = 10;

function getDbClient() {
  if (!db) {
    throw new FirebaseConfigError();
  }

  return db;
}

function entryCollection(uid: string) {
  const dbClient = getDbClient();
  return collection(dbClient, "users", uid, "entries");
}

function getStorageClient() {
  if (!storage) {
    throw new FirebaseConfigError();
  }

  return storage;
}

function entryBackupPath(uid: string, entryId: string): string {
  return `users/${uid}/entries/${entryId}.json`;
}

function isStorageObjectNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }

  return (error as { code?: unknown }).code === "storage/object-not-found";
}

async function syncEntryBackupToStorage(
  uid: string,
  entryId: string,
  payload: ReturnType<typeof normalizeEntryInput>,
): Promise<void> {
  try {
    const backupObject = {
      schemaVersion: 1,
      source: "shifttracker",
      uid,
      entry: {
        id: entryId,
        ...payload,
      },
      syncedAt: new Date().toISOString(),
    };

    await uploadString(
      storageRef(getStorageClient(), entryBackupPath(uid, entryId)),
      JSON.stringify(backupObject),
      "raw",
      { contentType: "application/json" },
    );
  } catch (error) {
    // Best-effort mirror so Firestore remains the source of truth.
    console.warn("Unable to mirror entry backup to Cloud Storage.", error);
  }
}

async function deleteEntryBackupFromStorage(uid: string, entryId: string): Promise<void> {
  try {
    await deleteObject(storageRef(getStorageClient(), entryBackupPath(uid, entryId)));
  } catch (error) {
    if (!isStorageObjectNotFound(error)) {
      console.warn("Unable to delete entry backup from Cloud Storage.", error);
    }
  }
}

function cloneEntries(entries: RotaEntry[]): RotaEntry[] {
  return entries.map((entry) => ({ ...entry }));
}

function toUniqueDateList(dates: string[]): string[] {
  return Array.from(new Set(dates.filter(Boolean)));
}

function chunkValues<T>(values: T[], chunkSize: number): T[][] {
  if (values.length === 0) {
    return [];
  }

  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
}

function dedupeEntriesByDate(entries: RotaEntry[]): RotaEntry[] {
  const latestEntryByDate = new Map<string, RotaEntry>();

  entries.forEach((entry) => {
    const existing = latestEntryByDate.get(entry.date);

    if (!existing || entry.updatedAt >= existing.updatedAt) {
      latestEntryByDate.set(entry.date, { ...entry });
    }
  });

  return Array.from(latestEntryByDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function getLatestEntryIdsByDate(uid: string, dates: string[]): Promise<Map<string, string>> {
  const uniqueDates = toUniqueDateList(dates);

  if (uniqueDates.length === 0) {
    return new Map();
  }

  const snapshots = await Promise.all(
    chunkValues(uniqueDates, FIRESTORE_IN_QUERY_LIMIT).map((dateChunk) =>
      runFirestoreRead(
        () => getDocs(query(entryCollection(uid), where("date", "in", dateChunk))),
        "Unable to prepare entries.",
      ),
    ),
  );

  const latestByDate = new Map<string, { id: string; updatedAt: string }>();

  snapshots.forEach((snapshot) => {
    snapshot.docs.forEach((entryDoc) => {
      const entry = toRotaEntry(entryDoc.id, entryDoc.data());
      const existing = latestByDate.get(entry.date);

      if (!existing || entry.updatedAt >= existing.updatedAt) {
        latestByDate.set(entry.date, { id: entry.id, updatedAt: entry.updatedAt });
      }
    });
  });

  return new Map(Array.from(latestByDate.entries()).map(([date, details]) => [date, details.id]));
}

function buildRangeCacheKey(uid: string, startDate: string, endDate: string, type: EntryType | "all" = "all") {
  return `${uid}|${startDate}|${endDate}|${type}`;
}

function readEntriesFromCache(cacheKey: string): RotaEntry[] | null {
  const cached = entriesRangeCache.get(cacheKey);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    entriesRangeCache.delete(cacheKey);
    return null;
  }

  return cloneEntries(cached.data);
}

function writeEntriesToCache(cacheKey: string, entries: RotaEntry[]): void {
  entriesRangeCache.set(cacheKey, {
    data: cloneEntries(entries),
    expiresAt: Date.now() + ENTRIES_CACHE_TTL_MS,
  });
}

function invalidateUserEntryCache(uid: string): void {
  const uidPrefix = `${uid}|`;

  for (const cacheKey of entriesRangeCache.keys()) {
    if (cacheKey.startsWith(uidPrefix)) {
      entriesRangeCache.delete(cacheKey);
    }
  }
}

function getDefaultTitle(type: EntryType): string {
  return type === "shift" ? "Work Shift" : ENTRY_TYPE_LABEL[type];
}

function normalizeEntryInput(input: RotaEntryInput): Omit<RotaEntryInput, "title"> & { title: string } {
  const type = VALID_ENTRY_TYPES.includes(input.type) ? input.type : "shift";

  const base = {
    date: input.date,
    type,
    title: input.title?.trim() || getDefaultTitle(type),
    startTime: input.startTime ?? null,
    endTime: input.endTime ?? null,
    leaveSubtype: input.leaveSubtype ?? null,
    location: input.location?.trim() || null,
    notes: input.notes?.trim() || null,
    color: input.color || ENTRY_TYPE_COLOR[type],
  };

  if (type !== "shift") {
    base.startTime = null;
    base.endTime = null;
  }

  if (type !== "leave") {
    base.leaveSubtype = null;
  }

  return base;
}

function toRotaEntry(entryId: string, data: Record<string, unknown>): RotaEntry {
  const type = VALID_ENTRY_TYPES.includes(data.type as EntryType) ? (data.type as EntryType) : "shift";

  return {
    id: entryId,
    date: typeof data.date === "string" ? data.date : "",
    type,
    title: typeof data.title === "string" ? data.title : getDefaultTitle(type),
    startTime: typeof data.startTime === "string" ? data.startTime : null,
    endTime: typeof data.endTime === "string" ? data.endTime : null,
    leaveSubtype:
      data.leaveSubtype === "annual" ||
      data.leaveSubtype === "sick" ||
      data.leaveSubtype === "unpaid" ||
      data.leaveSubtype === "personal"
        ? data.leaveSubtype
        : null,
    location: typeof data.location === "string" ? data.location : null,
    notes: typeof data.notes === "string" ? data.notes : null,
    color: typeof data.color === "string" ? data.color : ENTRY_TYPE_COLOR[type],
    createdAt: toIsoTimestamp(data.createdAt),
    updatedAt: toIsoTimestamp(data.updatedAt),
  };
}

function parseTimeToMinutes(time: string | null): number | null {
  if (!time) {
    return null;
  }

  const [hoursText, minutesText] = time.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

function sortByDateAndStartTimeAsc(a: RotaEntry, b: RotaEntry): number {
  if (a.date !== b.date) {
    return a.date.localeCompare(b.date);
  }

  const aStart = parseTimeToMinutes(a.startTime);
  const bStart = parseTimeToMinutes(b.startTime);

  if (aStart === null && bStart === null) {
    return 0;
  }

  if (aStart === null) {
    return 1;
  }

  if (bStart === null) {
    return -1;
  }

  return aStart - bStart;
}

function hasStartedShiftToday(entries: RotaEntry[], today: string, nowMinutes: number): boolean {
  return entries.some((entry) => {
    if (entry.type !== "shift" || entry.date !== today) {
      return false;
    }

    const startMinutes = parseTimeToMinutes(entry.startTime);
    return startMinutes !== null && nowMinutes >= startMinutes;
  });
}

function findNextShift(entries: RotaEntry[], fromDate: string, now: Date = new Date()): RotaEntry | null {
  const today = toDateKey(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const shouldExcludeToday = fromDate === today && hasStartedShiftToday(entries, today, nowMinutes);

  const nextShift = entries
    .filter((entry) => entry.type === "shift" && (shouldExcludeToday ? entry.date > fromDate : entry.date >= fromDate))
    .sort(sortByDateAndStartTimeAsc)[0];

  return nextShift ? { ...nextShift } : null;
}

export async function createEntry(uid: string, input: RotaEntryInput): Promise<string> {
  const [entryId] = await createEntries(uid, [input]);
  return entryId;
}

export async function createEntries(uid: string, inputs: RotaEntryInput[]): Promise<string[]> {
  if (inputs.length === 0) {
    return [];
  }

  const normalizedPayloads = inputs.map((input) => normalizeEntryInput(input));
  const payloadByDate = new Map(normalizedPayloads.map((payload) => [payload.date, payload]));
  const payloads = Array.from(payloadByDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  const existingEntryIdsByDate = await getLatestEntryIdsByDate(
    uid,
    payloads.map((payload) => payload.date),
  );
  const entryIds: string[] = [];
  const entriesRef = entryCollection(uid);
  const batch = writeBatch(getDbClient());

  payloads.forEach((payload) => {
    const existingEntryId = existingEntryIdsByDate.get(payload.date);

    if (existingEntryId) {
      const existingEntryRef = doc(entriesRef, existingEntryId);
      entryIds.push(existingEntryId);
      batch.update(existingEntryRef, {
        ...payload,
        updatedAt: serverTimestamp(),
      });
      return;
    }

    const nextEntryRef = doc(entriesRef);
    entryIds.push(nextEntryRef.id);
    batch.set(nextEntryRef, {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  try {
    await runFirestoreWrite(() => batch.commit(), "Unable to create entries.");
  } catch (error) {
    throw toFirebaseAppError(error, "Unable to create entries.");
  }

  await Promise.all(entryIds.map((entryId, index) => syncEntryBackupToStorage(uid, entryId, payloads[index])));
  invalidateUserEntryCache(uid);

  return entryIds;
}

export async function updateEntry(uid: string, entryId: string, input: RotaEntryInput): Promise<void> {
  const payload = normalizeEntryInput(input);

  try {
    const entryRef = doc(getDbClient(), "users", uid, "entries", entryId);

    await runFirestoreWrite(
      () =>
        updateDoc(entryRef, {
          ...payload,
          updatedAt: serverTimestamp(),
        }),
      "Unable to update entry.",
    );
  } catch (error) {
    throw toFirebaseAppError(error, "Unable to update entry.");
  }

  await syncEntryBackupToStorage(uid, entryId, payload);
  invalidateUserEntryCache(uid);
}

export async function deleteEntry(uid: string, entryId: string): Promise<void> {
  try {
    const entryRef = doc(getDbClient(), "users", uid, "entries", entryId);
    await runFirestoreWrite(() => deleteDoc(entryRef), "Unable to delete entry.");
  } catch (error) {
    throw toFirebaseAppError(error, "Unable to delete entry.");
  }

  await deleteEntryBackupFromStorage(uid, entryId);
  invalidateUserEntryCache(uid);
}

export async function getEntryById(uid: string, entryId: string): Promise<RotaEntry | null> {
  try {
    const entryRef = doc(getDbClient(), "users", uid, "entries", entryId);
    const snapshot = await runFirestoreRead(() => getDoc(entryRef), "Unable to load entry.");

    if (!snapshot.exists()) {
      return null;
    }

    return toRotaEntry(snapshot.id, snapshot.data());
  } catch (error) {
    throw toFirebaseAppError(error, "Unable to load entry.");
  }
}

export async function getEntriesByRange(
  uid: string,
  startDate: string,
  endDate: string,
  filters: RotaEntryFilters = {},
): Promise<RotaEntry[]> {
  const requestedType = filters.type ?? "all";
  const cacheKey = buildRangeCacheKey(uid, startDate, endDate, requestedType);
  const cachedEntries = readEntriesFromCache(cacheKey);

  if (cachedEntries) {
    return cachedEntries;
  }

  try {
    let entriesQuery = query(
      entryCollection(uid),
      where("date", ">=", startDate),
      where("date", "<=", endDate),
      orderBy("date", "asc"),
    );

    if (requestedType !== "all") {
      entriesQuery = query(entriesQuery, where("type", "==", requestedType));
    }

    const snapshot = await runFirestoreRead(() => getDocs(entriesQuery), "Unable to load entries.");
    const remoteEntries = snapshot.docs.map((entryDoc) => toRotaEntry(entryDoc.id, entryDoc.data()));
    const dedupedRemoteEntries = dedupeEntriesByDate(remoteEntries);

    writeEntriesToCache(cacheKey, dedupedRemoteEntries);

    return dedupedRemoteEntries;
  } catch (error) {
    throw toFirebaseAppError(error, "Unable to load entries.");
  }
}

export function subscribeToEntriesByRange(
  uid: string,
  startDate: string,
  endDate: string,
  filters: RotaEntryFilters = {},
  onEntries: (entries: RotaEntry[]) => void,
  onError?: (error: unknown) => void,
): () => void {
  const requestedType = filters.type ?? "all";
  const cacheKey = buildRangeCacheKey(uid, startDate, endDate, requestedType);
  const cachedEntries = readEntriesFromCache(cacheKey);

  if (cachedEntries) {
    onEntries(cachedEntries);
  }

  try {
    let entriesQuery = query(
      entryCollection(uid),
      where("date", ">=", startDate),
      where("date", "<=", endDate),
      orderBy("date", "asc"),
    );

    if (requestedType !== "all") {
      entriesQuery = query(entriesQuery, where("type", "==", requestedType));
    }

    return onSnapshot(
      entriesQuery,
      (snapshot) => {
        const remoteEntries = snapshot.docs.map((entryDoc) => toRotaEntry(entryDoc.id, entryDoc.data()));
        const dedupedRemoteEntries = dedupeEntriesByDate(remoteEntries);
        writeEntriesToCache(cacheKey, dedupedRemoteEntries);
        onEntries(cloneEntries(dedupedRemoteEntries));
      },
      (error) => {
        onError?.(toFirebaseAppError(error, "Unable to subscribe to entries."));
      },
    );
  } catch (error) {
    onError?.(toFirebaseAppError(error, "Unable to subscribe to entries."));
    return () => {};
  }
}

export async function getEntriesByWeek(uid: string, weekStart: string, weekEnd: string): Promise<RotaEntry[]> {
  return getEntriesByRange(uid, weekStart, weekEnd);
}

export async function getEntriesByMonth(uid: string, monthStart: string, monthEnd: string): Promise<RotaEntry[]> {
  return getEntriesByRange(uid, monthStart, monthEnd);
}

export async function getEntriesForList(uid: string, filters: RotaEntryFilters = {}): Promise<RotaEntry[]> {
  const now = new Date();
  const todayKey = toDateKey(now);
  const defaultTo = `${now.getFullYear() + 1}-12-31`;

  const requestedFrom = filters.fromDate ?? todayKey;
  const requestedTo = filters.toDate ?? defaultTo;
  const startDate = requestedFrom < todayKey ? todayKey : requestedFrom;
  const endDate = requestedTo < startDate ? startDate : requestedTo;

  const results = await getEntriesByRange(uid, startDate, endDate, filters);

  return results
    .filter((entry) => entry.date >= todayKey)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getTodayEntry(uid: string, today: string): Promise<RotaEntry | null> {
  const entries = await getEntriesByRange(uid, today, today);

  if (entries.length === 0) {
    return null;
  }

  return entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
}

export async function getNextShift(uid: string, fromDate: string): Promise<RotaEntry | null> {
  try {
    const snapshot = await runFirestoreRead(
      () =>
        getDocs(
          query(
            entryCollection(uid),
            where("date", ">=", fromDate),
            where("type", "==", "shift"),
            orderBy("date", "asc"),
            limit(50),
          ),
        ),
      "Unable to load upcoming shift.",
    );

    if (snapshot.empty) {
      return null;
    }

    const remoteEntries = snapshot.docs
      .map((entryDoc) => toRotaEntry(entryDoc.id, entryDoc.data()))
      .sort(sortByDateAndStartTimeAsc);

    const resolvedNextShift = findNextShift(remoteEntries, fromDate);
    if (resolvedNextShift) {
      return resolvedNextShift;
    }

    const futureSnapshot = await runFirestoreRead(
      () =>
        getDocs(
          query(
            entryCollection(uid),
            where("date", ">", fromDate),
            where("type", "==", "shift"),
            orderBy("date", "asc"),
            limit(1),
          ),
        ),
      "Unable to load upcoming shift.",
    );

    if (futureSnapshot.empty) {
      return null;
    }

    const futureEntryDoc = futureSnapshot.docs[0];
    return toRotaEntry(futureEntryDoc.id, futureEntryDoc.data());
  } catch (error) {
    throw toFirebaseAppError(error, "Unable to load upcoming shift.");
  }
}

export async function getUpcomingShiftEntries(
  uid: string,
  fromDate: string,
  maxResults: number = 80,
): Promise<RotaEntry[]> {
  try {
    const snapshot = await runFirestoreRead(
      () =>
        getDocs(
          query(
            entryCollection(uid),
            where("date", ">=", fromDate),
            where("type", "==", "shift"),
            orderBy("date", "asc"),
            limit(maxResults),
          ),
        ),
      "Unable to load shift reminders.",
    );

    return snapshot.docs
      .map((entryDoc) => toRotaEntry(entryDoc.id, entryDoc.data()))
      .sort(sortByDateAndStartTimeAsc);
  } catch (error) {
    throw toFirebaseAppError(error, "Unable to load shift reminders.");
  }
}
