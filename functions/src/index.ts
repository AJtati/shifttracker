import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { getFunctions } from "firebase-admin/functions";
import { MulticastMessage, getMessaging } from "firebase-admin/messaging";
import * as logger from "firebase-functions/logger";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { DateTime } from "luxon";

initializeApp();

const db = getFirestore();
const messaging = getMessaging();

const APP_NAME = "ShiftTracker";
const SCHEDULE_REGION = "us-central1";
const LOOKAHEAD_DAYS = 8;
const SCHEDULE_LOOKBACK_SECONDS = 60;
const MAX_TOKENS_PER_USER = 20;
const MAX_SCHEDULED_REMINDERS_PER_USER = 160;
const REMINDER_SYNC_DELAY_SECONDS = 15;
const REMINDER_TASK_MIN_DELAY_SECONDS = 5;
const REMINDER_TASK_DISPATCH_DEADLINE_SECONDS = 120;
const REMINDER_QUEUE_COLLECTION = "scheduledPushReminders";
const ANDROID_REMINDER_CHANNEL_ID = "shift-reminders-v2";

const INVALID_TOKEN_ERROR_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

const PROFILE_SYNC_FIELDS = [
  "fullName",
  "timezone",
  "timeFormat",
  "shiftReminderEnabled",
  "shiftReminderValue",
  "shiftReminderUnit",
  "shiftEndReminderEnabled",
  "shiftEndReminderValue",
  "shiftEndReminderUnit",
  "dayBeforeReminderEnabled",
  "dayBeforeReminderTime",
  "holidayLeaveReminderEnabled",
  "holidayLeaveReminderTime",
] as const;

type TimeFormat = "12h" | "24h";
type ShiftReminderUnit = "minutes" | "hours";
type EntryType = "shift" | "leave" | "holiday" | "off";
type ReminderSource = "shift-reminder" | "shift-end-reminder" | "day-before-reminder" | "holiday-leave-reminder";

interface UserProfile {
  uid: string;
  fullName: string;
  timezone: string;
  timeFormat: TimeFormat;
  shiftReminderEnabled: boolean;
  shiftReminderValue: number;
  shiftReminderUnit: ShiftReminderUnit;
  shiftEndReminderEnabled: boolean;
  shiftEndReminderValue: number;
  shiftEndReminderUnit: ShiftReminderUnit;
  dayBeforeReminderEnabled: boolean;
  dayBeforeReminderTime: string;
  holidayLeaveReminderEnabled: boolean;
  holidayLeaveReminderTime: string;
}

interface EntryRecord {
  id: string;
  date: string;
  type: EntryType;
  title: string;
  startTime: string | null;
  endTime: string | null;
  updatedAtMillis: number;
}

interface DeviceTokenRecord {
  id: string;
  token: string;
}

interface DueReminder {
  id: string;
  source: ReminderSource;
  entryId: string;
  entryDate: string;
  triggerAtUtc: DateTime;
  title: string;
  body: string;
  data: Record<string, string>;
}

interface ScheduledReminderRecord {
  id: string;
  source: ReminderSource;
  entryId: string;
  entryDate: string;
  triggerAtMillis: number;
  title: string;
  body: string;
  data: Record<string, string>;
  taskId: string | null;
  status: string;
}

interface PushReminderTaskPayload {
  uid: string;
  reminderId: string;
}

interface ReminderSyncTaskPayload {
  uid: string;
  reason: string;
}

interface SyncScheduleResult {
  reason: string;
  removedCount: number;
  upsertedCount: number;
  unchangedCount: number;
  desiredCount: number;
}

interface DispatchResult {
  sent: boolean;
  invalidTokenIds: string[];
  shouldRetry: boolean;
  firstFailureCode: string | null;
}

const reminderTaskQueue = getFunctions().taskQueue<PushReminderTaskPayload>(
  `locations/${SCHEDULE_REGION}/functions/processShiftReminderPushTask`,
);

const reminderSyncTaskQueue = getFunctions().taskQueue<ReminderSyncTaskPayload>(
  `locations/${SCHEDULE_REGION}/functions/processShiftReminderSyncTask`,
);

function isTimeValue(value: unknown): value is string {
  return typeof value === "string" && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value);
}

function isEntryType(value: unknown): value is EntryType {
  return value === "shift" || value === "leave" || value === "holiday" || value === "off";
}

function isReminderSource(value: unknown): value is ReminderSource {
  return (
    value === "shift-reminder" ||
    value === "shift-end-reminder" ||
    value === "day-before-reminder" ||
    value === "holiday-leave-reminder"
  );
}

function toDateKey(date: DateTime): string {
  return date.toFormat("yyyy-LL-dd");
}

function toUpdatedAtMillis(value: unknown): number {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

function toTriggerAtMillis(value: unknown): number {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

function clampShiftReminderValue(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 15;
  }

  return Math.max(0, Math.min(10080, Math.round(value)));
}

function getLeadMinutes(profile: UserProfile): number {
  const value = clampShiftReminderValue(profile.shiftReminderValue);
  return profile.shiftReminderUnit === "hours" ? value * 60 : value;
}

function getShiftEndLeadMinutes(profile: UserProfile): number {
  const value = clampShiftReminderValue(profile.shiftEndReminderValue);
  return profile.shiftEndReminderUnit === "hours" ? value * 60 : value;
}

function normalizeDisplayName(fullName: string): string {
  const trimmed = fullName.trim();
  return trimmed.length > 0 ? trimmed : "there";
}

function formatTimeValue(time: string | null, timeFormat: TimeFormat): string {
  if (!time) {
    return "--:--";
  }

  if (timeFormat === "24h") {
    return time;
  }

  const parsed = DateTime.fromFormat(time, "HH:mm", { zone: "UTC" });
  return parsed.isValid ? parsed.toFormat("hh:mm a") : time;
}

function formatDateDayMonthYear(dateKey: string): string {
  const parsed = DateTime.fromFormat(dateKey, "yyyy-LL-dd", { zone: "UTC" });
  return parsed.isValid ? parsed.toFormat("dd-LLLL-yyyy") : dateKey;
}

function parseDateTime(dateKey: string, time: string | null, zone: string): DateTime | null {
  if (!isTimeValue(time)) {
    return null;
  }

  const parsed = DateTime.fromFormat(`${dateKey} ${time}`, "yyyy-LL-dd HH:mm", { zone });
  return parsed.isValid ? parsed : null;
}

function hashToId(input: string): string {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) | 0;
  }

  return Math.abs(hash).toString(36);
}

function buildReminderId(
  uid: string,
  source: ReminderSource,
  entryId: string,
  triggerAtUtcIso: string,
  variant: string,
): string {
  return `${source}-${hashToId(`${uid}|${source}|${entryId}|${triggerAtUtcIso}|${variant}`)}`;
}

function buildLegacyTaskId(uid: string, reminderId: string): string {
  return `${hashToId(uid)}-${reminderId}`;
}

function buildTaskId(uid: string, reminderId: string, triggerAtMillis: number, nowMillis = Date.now()): string {
  const triggerKey = Math.max(0, Math.floor(triggerAtMillis / 1000)).toString(36);
  const enqueueBucket = Math.floor(nowMillis / (REMINDER_SYNC_DELAY_SECONDS * 1000)).toString(36);
  return `${hashToId(uid)}-${hashToId(reminderId)}-${triggerKey}-${enqueueBucket}`;
}

function buildSyncTaskId(uid: string, nowMillis = Date.now()): string {
  const enqueueBucket = Math.floor(nowMillis / (REMINDER_SYNC_DELAY_SECONDS * 1000)).toString(36);
  return `sync-${hashToId(uid)}-${enqueueBucket}`;
}

function getReminderTaskIdsForCleanup(uid: string, reminderId: string, persistedTaskId: string | null): string[] {
  const taskIds = new Set<string>();

  if (typeof persistedTaskId === "string" && persistedTaskId.trim().length > 0) {
    taskIds.add(persistedTaskId);
  }

  taskIds.add(buildLegacyTaskId(uid, reminderId));
  return Array.from(taskIds);
}

function stableStringifyMap(input: Record<string, string>): string {
  const normalized: Record<string, string> = {};

  Object.keys(input)
    .sort((a, b) => a.localeCompare(b))
    .forEach((key) => {
      normalized[key] = input[key];
    });

  return JSON.stringify(normalized);
}

function isAlreadyExistsError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: unknown; message?: unknown };
  const codeText = String(maybeError.code ?? "");
  const messageText = String(maybeError.message ?? "").toLowerCase();

  return (
    codeText === "6" ||
    codeText === "already-exists" ||
    codeText === "functions/task-already-exists" ||
    messageText.includes("already exists")
  );
}

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: unknown; message?: unknown };
  const codeText = String(maybeError.code ?? "");
  const messageText = String(maybeError.message ?? "").toLowerCase();

  return codeText === "5" || codeText === "not-found" || codeText === "functions/task-not-found" || messageText.includes("not found");
}

function getFirebaseErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return null;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function parseUserProfile(uid: string, data: FirebaseFirestore.DocumentData): UserProfile {
  const timezoneCandidate =
    typeof data.timezone === "string" && data.timezone.trim().length > 0 ? data.timezone.trim() : "UTC";

  const zoneCheck = DateTime.now().setZone(timezoneCandidate);
  const timezone = zoneCheck.isValid ? timezoneCandidate : "UTC";

  return {
    uid,
    fullName: typeof data.fullName === "string" ? data.fullName : "User",
    timezone,
    timeFormat: data.timeFormat === "12h" ? "12h" : "24h",
    shiftReminderEnabled: data.shiftReminderEnabled === true,
    shiftReminderValue: clampShiftReminderValue(data.shiftReminderValue),
    shiftReminderUnit: data.shiftReminderUnit === "hours" ? "hours" : "minutes",
    shiftEndReminderEnabled: data.shiftEndReminderEnabled === true,
    shiftEndReminderValue: clampShiftReminderValue(data.shiftEndReminderValue),
    shiftEndReminderUnit: data.shiftEndReminderUnit === "hours" ? "hours" : "minutes",
    dayBeforeReminderEnabled: data.dayBeforeReminderEnabled === true,
    dayBeforeReminderTime: isTimeValue(data.dayBeforeReminderTime) ? data.dayBeforeReminderTime : "21:00",
    holidayLeaveReminderEnabled: data.holidayLeaveReminderEnabled === true,
    holidayLeaveReminderTime: isTimeValue(data.holidayLeaveReminderTime) ? data.holidayLeaveReminderTime : "09:00",
  };
}

function parseEntry(entryId: string, data: FirebaseFirestore.DocumentData): EntryRecord | null {
  if (typeof data.date !== "string" || data.date.length !== 10 || !isEntryType(data.type)) {
    return null;
  }

  return {
    id: entryId,
    date: data.date,
    type: data.type,
    title: typeof data.title === "string" && data.title.trim().length > 0 ? data.title.trim() : "Shift entry",
    startTime: isTimeValue(data.startTime) ? data.startTime : null,
    endTime: isTimeValue(data.endTime) ? data.endTime : null,
    updatedAtMillis: toUpdatedAtMillis(data.updatedAt),
  };
}

function toStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const result: Record<string, string> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, entryValue]) => {
    if (typeof entryValue === "string") {
      result[key] = entryValue;
    }
  });

  return result;
}

function parseScheduledReminderRecord(
  reminderId: string,
  data: FirebaseFirestore.DocumentData,
): ScheduledReminderRecord | null {
  if (!isReminderSource(data.source)) {
    return null;
  }

  if (typeof data.entryId !== "string" || typeof data.entryDate !== "string") {
    return null;
  }

  if (typeof data.title !== "string" || typeof data.body !== "string") {
    return null;
  }

  const triggerAtMillis = toTriggerAtMillis(data.triggerAt);
  if (triggerAtMillis <= 0) {
    return null;
  }

  return {
    id: reminderId,
    source: data.source,
    entryId: data.entryId,
    entryDate: data.entryDate,
    triggerAtMillis,
    title: data.title,
    body: data.body,
    data: toStringMap(data.data),
    taskId: typeof data.taskId === "string" ? data.taskId : null,
    status: typeof data.status === "string" ? data.status : "scheduled",
  };
}

function dedupeEntriesByDate(entries: EntryRecord[]): EntryRecord[] {
  const latestEntryByDate = new Map<string, EntryRecord>();

  for (const entry of entries) {
    const existingEntry = latestEntryByDate.get(entry.date);

    if (!existingEntry || entry.updatedAtMillis >= existingEntry.updatedAtMillis) {
      latestEntryByDate.set(entry.date, entry);
    }
  }

  return Array.from(latestEntryByDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function buildLeadLabel(profile: UserProfile): string {
  const value = clampShiftReminderValue(profile.shiftReminderValue);
  const unit = profile.shiftReminderUnit === "hours" ? "hour" : "minute";
  return `${value} ${value === 1 ? unit : `${unit}s`}`;
}

function buildShiftEndLeadLabel(profile: UserProfile): string {
  const value = clampShiftReminderValue(profile.shiftEndReminderValue);
  const unit = profile.shiftEndReminderUnit === "hours" ? "hour" : "minute";
  return `${value} ${value === 1 ? unit : `${unit}s`}`;
}

function buildDayBeforeBody(entry: EntryRecord, profile: UserProfile, displayName: string): string {
  const name = normalizeDisplayName(displayName);

  if (entry.type === "shift") {
    return `Hey ${name}, you have shift tomorrow at ${formatTimeValue(entry.startTime, profile.timeFormat)}.`;
  }

  if (entry.type === "holiday") {
    return `Hey ${name}, it is holiday tomorrow. Enjoy your day.`;
  }

  if (entry.type === "leave") {
    return `Hey ${name}, you have leave tomorrow. Enjoy your day.`;
  }

  return `Hey ${name}, you have an entry tomorrow.`;
}

function buildSameDayBody(entry: EntryRecord, profile: UserProfile, displayName: string): string {
  const name = normalizeDisplayName(displayName);

  if (entry.type === "shift") {
    return `Hey ${name}, you have shift today at ${formatTimeValue(entry.startTime, profile.timeFormat)}.`;
  }

  if (entry.type === "holiday") {
    return `Hey ${name}, it is holiday today. Enjoy your day.`;
  }

  return `Hey ${name}, you have leave today.`;
}

function shouldScheduleTrigger(triggerAtLocal: DateTime, nowLocal: DateTime): boolean {
  return triggerAtLocal.toMillis() >= nowLocal.minus({ seconds: SCHEDULE_LOOKBACK_SECONDS }).toMillis();
}

function buildScheduledRemindersForUser(
  profile: UserProfile,
  entries: EntryRecord[],
  nowUtc: DateTime,
): DueReminder[] {
  const nowLocal = nowUtc.setZone(profile.timezone);
  const reminders: DueReminder[] = [];
  const leadMinutes = getLeadMinutes(profile);
  const leadLabel = buildLeadLabel(profile);
  const shiftEndLeadMinutes = getShiftEndLeadMinutes(profile);
  const shiftEndLeadLabel = buildShiftEndLeadLabel(profile);

  for (const entry of entries) {
    if (profile.shiftReminderEnabled && entry.type === "shift") {
      const shiftStart = parseDateTime(entry.date, entry.startTime, profile.timezone);

      if (shiftStart) {
        const triggerAt = shiftStart.minus({ minutes: leadMinutes });

        if (shouldScheduleTrigger(triggerAt, nowLocal)) {
          const triggerAtUtcIso = triggerAt.toUTC().toISO() ?? triggerAt.toUTC().toMillis().toString();
          const reminderId = buildReminderId(
            profile.uid,
            "shift-reminder",
            entry.id,
            triggerAtUtcIso,
            String(leadMinutes),
          );

          reminders.push({
            id: reminderId,
            source: "shift-reminder",
            entryId: entry.id,
            entryDate: entry.date,
            triggerAtUtc: triggerAt.toUTC(),
            title: `${entry.title} in ${leadLabel}`,
            body: `${formatDateDayMonthYear(entry.date)} at ${formatTimeValue(entry.startTime, profile.timeFormat)} • ${APP_NAME}`,
            data: {
              uid: profile.uid,
              source: "shift-reminder",
              entryId: entry.id,
              entryDate: entry.date,
            },
          });
        }
      }
    }

    if (profile.shiftEndReminderEnabled && entry.type === "shift") {
      const shiftEnd = parseDateTime(entry.date, entry.endTime, profile.timezone);

      if (shiftEnd) {
        const triggerAt = shiftEnd.minus({ minutes: shiftEndLeadMinutes });

        if (shouldScheduleTrigger(triggerAt, nowLocal)) {
          const triggerAtUtcIso = triggerAt.toUTC().toISO() ?? triggerAt.toUTC().toMillis().toString();
          const reminderId = buildReminderId(
            profile.uid,
            "shift-end-reminder",
            entry.id,
            triggerAtUtcIso,
            String(shiftEndLeadMinutes),
          );

          reminders.push({
            id: reminderId,
            source: "shift-end-reminder",
            entryId: entry.id,
            entryDate: entry.date,
            triggerAtUtc: triggerAt.toUTC(),
            title: `${entry.title} ends in ${shiftEndLeadLabel}`,
            body: `${formatDateDayMonthYear(entry.date)} at ${formatTimeValue(entry.endTime, profile.timeFormat)} • ${APP_NAME}`,
            data: {
              uid: profile.uid,
              source: "shift-end-reminder",
              entryId: entry.id,
              entryDate: entry.date,
            },
          });
        }
      }
    }

    if (profile.dayBeforeReminderEnabled && entry.type !== "off") {
      const entryDate = DateTime.fromFormat(entry.date, "yyyy-LL-dd", { zone: profile.timezone });

      if (entryDate.isValid) {
        const reminderDate = entryDate.minus({ days: 1 });
        const triggerAt = parseDateTime(toDateKey(reminderDate), profile.dayBeforeReminderTime, profile.timezone);

        if (triggerAt && shouldScheduleTrigger(triggerAt, nowLocal)) {
          const triggerAtUtcIso = triggerAt.toUTC().toISO() ?? triggerAt.toUTC().toMillis().toString();
          const reminderId = buildReminderId(
            profile.uid,
            "day-before-reminder",
            entry.id,
            triggerAtUtcIso,
            profile.dayBeforeReminderTime,
          );

          reminders.push({
            id: reminderId,
            source: "day-before-reminder",
            entryId: entry.id,
            entryDate: entry.date,
            triggerAtUtc: triggerAt.toUTC(),
            title: `${entry.title} tomorrow`,
            body: buildDayBeforeBody(entry, profile, profile.fullName),
            data: {
              uid: profile.uid,
              source: "day-before-reminder",
              entryId: entry.id,
              entryDate: entry.date,
            },
          });
        }
      }
    }

    const allowShiftSameDayReminder = entry.type === "shift" && !profile.shiftReminderEnabled;
    if (
      profile.holidayLeaveReminderEnabled &&
      (entry.type === "holiday" || entry.type === "leave" || allowShiftSameDayReminder)
    ) {
      const triggerAt = parseDateTime(entry.date, profile.holidayLeaveReminderTime, profile.timezone);

      if (triggerAt && shouldScheduleTrigger(triggerAt, nowLocal)) {
        const triggerAtUtcIso = triggerAt.toUTC().toISO() ?? triggerAt.toUTC().toMillis().toString();
        const reminderId = buildReminderId(
          profile.uid,
          "holiday-leave-reminder",
          entry.id,
          triggerAtUtcIso,
          profile.holidayLeaveReminderTime,
        );

        reminders.push({
          id: reminderId,
          source: "holiday-leave-reminder",
          entryId: entry.id,
          entryDate: entry.date,
          triggerAtUtc: triggerAt.toUTC(),
          title: entry.type === "holiday" ? "Holiday today" : entry.type === "leave" ? "Leave today" : "Shift today",
          body: buildSameDayBody(entry, profile, profile.fullName),
          data: {
            uid: profile.uid,
            source: "holiday-leave-reminder",
            entryId: entry.id,
            entryDate: entry.date,
          },
        });
      }
    }
  }

  return reminders
    .sort((a, b) => a.triggerAtUtc.toMillis() - b.triggerAtUtc.toMillis())
    .slice(0, MAX_SCHEDULED_REMINDERS_PER_USER);
}

function scheduledReminderCollection(uid: string) {
  return db.collection("users").doc(uid).collection(REMINDER_QUEUE_COLLECTION);
}

async function getActiveDeviceTokens(uid: string): Promise<DeviceTokenRecord[]> {
  const snapshot = await db
    .collection("users")
    .doc(uid)
    .collection("deviceTokens")
    .where("enabled", "==", true)
    .limit(MAX_TOKENS_PER_USER)
    .get();

  return snapshot.docs
    .map((docSnapshot) => {
      const data = docSnapshot.data();

      return {
        id: docSnapshot.id,
        token: typeof data.token === "string" ? data.token : "",
      };
    })
    .filter((token) => token.token.length > 0);
}

async function getUpcomingEntries(uid: string, timezone: string): Promise<EntryRecord[]> {
  const localNow = DateTime.now().setZone(timezone).startOf("day");
  const startDate = toDateKey(localNow);
  const endDate = toDateKey(localNow.plus({ days: LOOKAHEAD_DAYS }));

  const snapshot = await db
    .collection("users")
    .doc(uid)
    .collection("entries")
    .where("date", ">=", startDate)
    .where("date", "<=", endDate)
    .get();

  const parsedEntries = snapshot.docs
    .map((docSnapshot) => parseEntry(docSnapshot.id, docSnapshot.data()))
    .filter((entry): entry is EntryRecord => Boolean(entry));

  return dedupeEntriesByDate(parsedEntries);
}

async function getScheduledReminderRecords(uid: string): Promise<Map<string, ScheduledReminderRecord>> {
  const snapshot = await scheduledReminderCollection(uid).get();
  const records = new Map<string, ScheduledReminderRecord>();

  snapshot.docs.forEach((docSnapshot) => {
    const parsed = parseScheduledReminderRecord(docSnapshot.id, docSnapshot.data());
    if (parsed) {
      records.set(parsed.id, parsed);
    }
  });

  return records;
}

async function deleteReminderTask(taskId: string): Promise<void> {
  try {
    await reminderTaskQueue.delete(taskId);
  } catch (error) {
    if (isNotFoundError(error)) {
      return;
    }

    throw error;
  }
}

async function enqueueReminderTask(uid: string, reminder: DueReminder): Promise<string> {
  const triggerAtDate = reminder.triggerAtUtc.toJSDate();
  const now = Date.now();
  const minScheduledAt = new Date(now + REMINDER_TASK_MIN_DELAY_SECONDS * 1000);
  const scheduleTime = triggerAtDate.getTime() > minScheduledAt.getTime() ? triggerAtDate : minScheduledAt;
  const taskId = buildTaskId(uid, reminder.id, scheduleTime.getTime(), now);

  try {
    await reminderTaskQueue.enqueue(
      { uid, reminderId: reminder.id },
      {
        id: taskId,
        scheduleTime,
        dispatchDeadlineSeconds: REMINDER_TASK_DISPATCH_DEADLINE_SECONDS,
      },
    );
  } catch (error) {
    if (!isAlreadyExistsError(error)) {
      throw error;
    }
  }

  return taskId;
}

async function clearScheduledReminders(
  uid: string,
  existingRecords?: Map<string, ScheduledReminderRecord>,
): Promise<number> {
  const records = existingRecords ?? (await getScheduledReminderRecords(uid));
  let removedCount = 0;

  for (const record of records.values()) {
    const taskIds = getReminderTaskIdsForCleanup(uid, record.id, record.taskId);

    for (const taskId of taskIds) {
      try {
        await deleteReminderTask(taskId);
      } catch (error) {
        logger.warn("Unable to delete reminder task during cleanup.", { uid, reminderId: record.id, taskId, error });
      }
    }

    await scheduledReminderCollection(uid).doc(record.id).delete();
    removedCount += 1;
  }

  return removedCount;
}

function hasSameScheduledReminder(existing: ScheduledReminderRecord, reminder: DueReminder): boolean {
  return (
    existing.triggerAtMillis === reminder.triggerAtUtc.toMillis() &&
    existing.title === reminder.title &&
    existing.body === reminder.body &&
    existing.source === reminder.source &&
    existing.entryId === reminder.entryId &&
    existing.entryDate === reminder.entryDate &&
    stableStringifyMap(existing.data) === stableStringifyMap(reminder.data)
  );
}

async function syncUserReminderSchedule(uid: string, reason: string): Promise<SyncScheduleResult> {
  const userSnapshot = await db.collection("users").doc(uid).get();
  const existingRecords = await getScheduledReminderRecords(uid);

  if (!userSnapshot.exists) {
    const removedCount = await clearScheduledReminders(uid, existingRecords);
    return {
      reason,
      removedCount,
      upsertedCount: 0,
      unchangedCount: 0,
      desiredCount: 0,
    };
  }

  const profile = parseUserProfile(uid, userSnapshot.data() ?? {});
  const remindersEnabled =
    profile.shiftReminderEnabled ||
    profile.shiftEndReminderEnabled ||
    profile.dayBeforeReminderEnabled ||
    profile.holidayLeaveReminderEnabled;
  const activeTokens = await getActiveDeviceTokens(uid);
  const hasActiveTokens = activeTokens.length > 0;

  if (!remindersEnabled || !hasActiveTokens) {
    const removedCount = await clearScheduledReminders(uid, existingRecords);
    return {
      reason,
      removedCount,
      upsertedCount: 0,
      unchangedCount: 0,
      desiredCount: 0,
    };
  }

  const nowUtc = DateTime.utc();
  const entries = await getUpcomingEntries(uid, profile.timezone);
  const desiredReminders = buildScheduledRemindersForUser(profile, entries, nowUtc);
  const desiredById = new Map(desiredReminders.map((reminder) => [reminder.id, reminder]));

  let removedCount = 0;
  let upsertedCount = 0;
  let unchangedCount = 0;

  for (const existingRecord of existingRecords.values()) {
    if (desiredById.has(existingRecord.id)) {
      continue;
    }

    const taskIds = getReminderTaskIdsForCleanup(uid, existingRecord.id, existingRecord.taskId);
    for (const taskId of taskIds) {
      try {
        await deleteReminderTask(taskId);
      } catch (error) {
        logger.warn("Unable to delete stale reminder task.", {
          uid,
          reminderId: existingRecord.id,
          taskId,
          error,
        });
      }
    }

    await scheduledReminderCollection(uid).doc(existingRecord.id).delete();
    removedCount += 1;
  }

  for (const reminder of desiredReminders) {
    const existingRecord = existingRecords.get(reminder.id);

    if (existingRecord && existingRecord.status === "scheduled" && hasSameScheduledReminder(existingRecord, reminder)) {
      unchangedCount += 1;
      continue;
    }

    if (existingRecord) {
      const taskIds = getReminderTaskIdsForCleanup(uid, reminder.id, existingRecord.taskId);
      for (const taskId of taskIds) {
        try {
          await deleteReminderTask(taskId);
        } catch (error) {
          logger.warn("Unable to delete replaced reminder task.", {
            uid,
            reminderId: reminder.id,
            taskId,
            error,
          });
        }
      }
    }

    const queuedTaskId = await enqueueReminderTask(uid, reminder);
    const reminderDocRef = scheduledReminderCollection(uid).doc(reminder.id);
    const payload: Record<string, unknown> = {
      source: reminder.source,
      entryId: reminder.entryId,
      entryDate: reminder.entryDate,
      triggerAt: Timestamp.fromDate(reminder.triggerAtUtc.toJSDate()),
      title: reminder.title,
      body: reminder.body,
      data: reminder.data,
      taskId: queuedTaskId,
      status: "scheduled",
      reason,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (!existingRecord) {
      payload.createdAt = FieldValue.serverTimestamp();
    }

    await reminderDocRef.set(payload, { merge: true });
    upsertedCount += 1;
  }

  return {
    reason,
    removedCount,
    upsertedCount,
    unchangedCount,
    desiredCount: desiredReminders.length,
  };
}

async function disableInvalidTokens(uid: string, tokenIds: string[]): Promise<void> {
  if (tokenIds.length === 0) {
    return;
  }

  const uniqueTokenIds = Array.from(new Set(tokenIds));
  const batch = db.batch();

  for (const tokenId of uniqueTokenIds) {
    const tokenRef = db.collection("users").doc(uid).collection("deviceTokens").doc(tokenId);
    batch.set(
      tokenRef,
      {
        enabled: false,
        updatedAt: FieldValue.serverTimestamp(),
        disabledAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  await batch.commit();
}

async function reserveReminderDispatch(uid: string, reminder: DueReminder): Promise<boolean> {
  const sentRef = db.collection("users").doc(uid).collection("sentPushReminders").doc(reminder.id);

  try {
    await sentRef.create({
      source: reminder.source,
      entryId: reminder.entryId,
      entryDate: reminder.entryDate,
      triggerAt: Timestamp.fromDate(reminder.triggerAtUtc.toJSDate()),
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      return false;
    }

    throw error;
  }
}

async function markReminderAsSent(
  uid: string,
  reminder: DueReminder,
  successCount: number,
  failureCount: number,
): Promise<void> {
  const sentRef = db.collection("users").doc(uid).collection("sentPushReminders").doc(reminder.id);
  await sentRef.set(
    {
      status: "sent",
      sentAt: FieldValue.serverTimestamp(),
      deliverySuccessCount: successCount,
      deliveryFailureCount: failureCount,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

async function markReminderAsFailed(uid: string, reminder: DueReminder, errorCode: string | null): Promise<void> {
  const sentRef = db.collection("users").doc(uid).collection("sentPushReminders").doc(reminder.id);
  await sentRef.set(
    {
      status: "failed",
      failedAt: FieldValue.serverTimestamp(),
      failureCode: errorCode,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

async function releaseReminderReservation(uid: string, reminder: DueReminder): Promise<void> {
  const sentRef = db.collection("users").doc(uid).collection("sentPushReminders").doc(reminder.id);
  await sentRef.delete();
}

async function dispatchReminder(
  uid: string,
  reminder: DueReminder,
  tokens: DeviceTokenRecord[],
): Promise<DispatchResult> {
  const tokenValues = tokens.map((token) => token.token);
  const message: MulticastMessage = {
    tokens: tokenValues,
    notification: {
      title: reminder.title,
      body: reminder.body,
    },
    data: reminder.data,
    android: {
      priority: "high",
      notification: {
        channelId: ANDROID_REMINDER_CHANNEL_ID,
        sound: "default",
        priority: "max",
        visibility: "public",
        defaultVibrateTimings: true,
      },
    },
    apns: {
      headers: {
        "apns-priority": "10",
      },
      payload: {
        aps: {
          sound: "default",
        },
      },
    },
  };

  const response = await messaging.sendEachForMulticast(message);
  const invalidTokenIds: string[] = [];
  let firstFailureCode: string | null = null;
  let hasRetryableFailure = false;

  response.responses.forEach((sendResponse, index) => {
    if (!sendResponse.error) {
      return;
    }

    const failureCode = getFirebaseErrorCode(sendResponse.error);
    if (!firstFailureCode) {
      firstFailureCode = failureCode;
    }

    if (failureCode && INVALID_TOKEN_ERROR_CODES.has(failureCode)) {
      invalidTokenIds.push(tokens[index].id);
      return;
    }

    hasRetryableFailure = true;
  });

  if (response.successCount > 0) {
    await markReminderAsSent(uid, reminder, response.successCount, response.failureCount);
    return { sent: true, invalidTokenIds, shouldRetry: false, firstFailureCode };
  }

  if (hasRetryableFailure) {
    await releaseReminderReservation(uid, reminder);
    return { sent: false, invalidTokenIds, shouldRetry: true, firstFailureCode };
  }

  await markReminderAsFailed(uid, reminder, firstFailureCode);
  return { sent: false, invalidTokenIds, shouldRetry: false, firstFailureCode };
}

function toDueReminderFromScheduledDoc(uid: string, reminderId: string, data: FirebaseFirestore.DocumentData): DueReminder | null {
  if (!isReminderSource(data.source)) {
    return null;
  }

  if (typeof data.entryId !== "string" || typeof data.entryDate !== "string") {
    return null;
  }

  if (typeof data.title !== "string" || typeof data.body !== "string") {
    return null;
  }

  if (!(data.triggerAt instanceof Timestamp)) {
    return null;
  }

  const triggerAtUtc = DateTime.fromJSDate(data.triggerAt.toDate()).toUTC();
  if (!triggerAtUtc.isValid) {
    return null;
  }

  return {
    id: reminderId,
    source: data.source,
    entryId: data.entryId,
    entryDate: data.entryDate,
    triggerAtUtc,
    title: data.title,
    body: data.body,
    data: {
      uid,
      ...toStringMap(data.data),
    },
  };
}

function didProfileReminderFieldsChange(
  beforeData: FirebaseFirestore.DocumentData | undefined,
  afterData: FirebaseFirestore.DocumentData | undefined,
): boolean {
  if (!beforeData || !afterData) {
    return true;
  }

  return PROFILE_SYNC_FIELDS.some((field) => beforeData[field] !== afterData[field]);
}

async function enqueueReminderSyncTask(uid: string, reason: string): Promise<void> {
  const taskId = buildSyncTaskId(uid);

  try {
    await reminderSyncTaskQueue.enqueue(
      { uid, reason },
      {
        id: taskId,
        scheduleDelaySeconds: REMINDER_SYNC_DELAY_SECONDS,
      },
    );
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      return;
    }

    throw error;
  }
}

export const processShiftReminderSyncTask = onTaskDispatched<ReminderSyncTaskPayload>(
  {
    region: SCHEDULE_REGION,
    timeoutSeconds: 120,
    memory: "256MiB",
    maxInstances: 10,
    retryConfig: {
      maxAttempts: 6,
      minBackoffSeconds: 20,
      maxBackoffSeconds: 600,
      maxDoublings: 5,
    },
    rateLimits: {
      maxConcurrentDispatches: 20,
      maxDispatchesPerSecond: 20,
    },
  },
  async (request) => {
    const uid = typeof request.data?.uid === "string" ? request.data.uid : "";
    const reason = typeof request.data?.reason === "string" ? request.data.reason : "unspecified";

    if (!uid) {
      logger.warn("Reminder sync task skipped: missing uid.", { requestData: request.data });
      return;
    }

    const startedAt = Date.now();
    const result = await syncUserReminderSchedule(uid, reason);

    logger.info("Reminder schedule sync completed.", {
      uid,
      reason: result.reason,
      removedCount: result.removedCount,
      upsertedCount: result.upsertedCount,
      unchangedCount: result.unchangedCount,
      desiredCount: result.desiredCount,
      durationMs: Date.now() - startedAt,
    });
  },
);

export const processShiftReminderPushTask = onTaskDispatched<PushReminderTaskPayload>(
  {
    region: SCHEDULE_REGION,
    timeoutSeconds: 180,
    memory: "256MiB",
    maxInstances: 20,
    retryConfig: {
      maxAttempts: 10,
      minBackoffSeconds: 30,
      maxBackoffSeconds: 3600,
      maxDoublings: 6,
    },
    rateLimits: {
      maxConcurrentDispatches: 50,
      maxDispatchesPerSecond: 50,
    },
  },
  async (request) => {
    const uid = typeof request.data?.uid === "string" ? request.data.uid : "";
    const reminderId = typeof request.data?.reminderId === "string" ? request.data.reminderId : "";

    if (!uid || !reminderId) {
      logger.warn("Reminder push task skipped: missing payload fields.", { requestData: request.data });
      return;
    }

    const queuedReminderRef = scheduledReminderCollection(uid).doc(reminderId);
    const queuedReminderSnapshot = await queuedReminderRef.get();

    if (!queuedReminderSnapshot.exists) {
      logger.info("Reminder push task skipped: queue entry no longer exists.", { uid, reminderId });
      return;
    }

    const reminder = toDueReminderFromScheduledDoc(uid, reminderId, queuedReminderSnapshot.data() ?? {});
    if (!reminder) {
      await queuedReminderRef.set(
        {
          status: "invalid",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      logger.warn("Reminder push task skipped: invalid queue entry.", { uid, reminderId });
      return;
    }

    const reserved = await reserveReminderDispatch(uid, reminder);
    if (!reserved) {
      await queuedReminderRef.delete();
      logger.info("Reminder push task skipped: duplicate reminder reservation.", { uid, reminderId });
      return;
    }

    const activeTokens = await getActiveDeviceTokens(uid);
    if (activeTokens.length === 0) {
      await markReminderAsFailed(uid, reminder, "no-active-tokens");
      await queuedReminderRef.delete();
      logger.info("Reminder push task skipped: no active device tokens.", { uid, reminderId });
      return;
    }

    const result = await dispatchReminder(uid, reminder, activeTokens);
    await disableInvalidTokens(uid, result.invalidTokenIds);

    if (result.sent) {
      await queuedReminderRef.delete();
      logger.info("Reminder push task delivered.", {
        uid,
        reminderId,
        invalidTokenCount: result.invalidTokenIds.length,
      });
      return;
    }

    if (result.shouldRetry) {
      await queuedReminderRef.set(
        {
          status: "retrying",
          lastErrorCode: result.firstFailureCode,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      throw new Error("Retryable push dispatch failure.");
    }

    await queuedReminderRef.delete();
    logger.warn("Reminder push task failed permanently.", {
      uid,
      reminderId,
      firstFailureCode: result.firstFailureCode,
      invalidTokenCount: result.invalidTokenIds.length,
    });
  },
);

export const syncShiftReminderQueueOnUserWrite = onDocumentWritten(
  {
    document: "users/{uid}",
    region: SCHEDULE_REGION,
    timeoutSeconds: 60,
    memory: "256MiB",
    maxInstances: 20,
    retry: false,
  },
  async (event) => {
    const uid = event.params.uid;
    if (!uid) {
      return;
    }

    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    if (!didProfileReminderFieldsChange(beforeData, afterData)) {
      return;
    }

    await enqueueReminderSyncTask(uid, "user-write");
  },
);

export const syncShiftReminderQueueOnEntryWrite = onDocumentWritten(
  {
    document: "users/{uid}/entries/{entryId}",
    region: SCHEDULE_REGION,
    timeoutSeconds: 60,
    memory: "256MiB",
    maxInstances: 20,
    retry: false,
  },
  async (event) => {
    const uid = event.params.uid;
    if (!uid) {
      return;
    }

    await enqueueReminderSyncTask(uid, "entry-write");
  },
);

export const syncShiftReminderQueueOnDeviceTokenWrite = onDocumentWritten(
  {
    document: "users/{uid}/deviceTokens/{tokenId}",
    region: SCHEDULE_REGION,
    timeoutSeconds: 60,
    memory: "256MiB",
    maxInstances: 20,
    retry: false,
  },
  async (event) => {
    const uid = event.params.uid;
    if (!uid) {
      return;
    }

    await enqueueReminderSyncTask(uid, "device-token-write");
  },
);
