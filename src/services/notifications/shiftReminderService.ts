import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { addDays } from "date-fns";

import { RotaEntry } from "@/types/entry";
import { UserPreferences } from "@/types/user";
import { APP_NAME } from "@/utils/constants";
import { formatDateDayMonthYear, formatTimeValue, parseDateKey, toDateKey } from "@/utils/date";

const SHIFT_REMINDER_SOURCE = "shift-reminder";
const SHIFT_END_REMINDER_SOURCE = "shift-end-reminder";
const DAY_BEFORE_REMINDER_SOURCE = "day-before-reminder";
const HOLIDAY_LEAVE_REMINDER_SOURCE = "holiday-leave-reminder";
const MAX_SCHEDULED_SHIFT_REMINDERS = 160;
export const SHIFT_REMINDER_CHANNEL_ID = "shift-reminders-v2";
const LEGACY_SHIFT_REMINDER_CHANNEL_ID = "shift-reminders";
const SHIFT_REMINDER_CHANNEL_NAME = "Shift reminders";
const EXACT_TRIGGER_TOLERANCE_MS = 1_000;

type ShiftReminderPreferences = Pick<
  UserPreferences,
  | "shiftReminderEnabled"
  | "shiftReminderUnit"
  | "shiftReminderValue"
  | "shiftEndReminderEnabled"
  | "shiftEndReminderUnit"
  | "shiftEndReminderValue"
  | "dayBeforeReminderEnabled"
  | "dayBeforeReminderTime"
  | "holidayLeaveReminderEnabled"
  | "holidayLeaveReminderTime"
  | "timeFormat"
>;

export type ShiftReminderSyncResult =
  | { status: "unsupported" | "disabled" | "permission-denied" }
  | { status: "scheduled"; scheduledCount: number; exactAlarmDenied?: boolean };

export type ShiftReminderTestResult =
  | { status: "unsupported" | "permission-denied" }
  | { status: "scheduled"; triggerAt: Date; exactAlarmDenied?: boolean };

function clampReminderValue(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(10080, Math.max(0, Math.round(value)));
}

function getLeadMinutes(value: number, unit: ShiftReminderPreferences["shiftReminderUnit"]): number {
  const normalizedValue = clampReminderValue(value);
  return unit === "hours" ? normalizedValue * 60 : normalizedValue;
}

function parseTimeValue(value: string | null): { hours: number; minutes: number } | null {
  if (!value) {
    return null;
  }

  const [hoursText, minutesText] = value.split(":");
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

  return {
    hours,
    minutes,
  };
}

function parseDateTime(dateKey: string, time: string | null): Date | null {
  const parsedTime = parseTimeValue(time);

  if (!parsedTime) {
    return null;
  }

  const baseDate = parseDateKey(dateKey);
  baseDate.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);

  return Number.isNaN(baseDate.getTime()) ? null : baseDate;
}

function parseShiftStartDate(dateKey: string, startTime: string | null): Date | null {
  return parseDateTime(dateKey, startTime);
}

function parseShiftEndDate(dateKey: string, endTime: string | null): Date | null {
  return parseDateTime(dateKey, endTime);
}

function resolveTriggerAt(triggerAt: Date, now: Date): Date | null {
  if (triggerAt > now) {
    return triggerAt;
  }

  const isWithinExactTolerance = now.getTime() - triggerAt.getTime() <= EXACT_TRIGGER_TOLERANCE_MS;
  if (!isWithinExactTolerance) {
    return null;
  }

  return new Date(now.getTime() + 1_000);
}

function hashToNotificationId(input: string): number {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) | 0;
  }

  return Math.abs(hash % 2_000_000_000) + 1;
}

function isManagedNotificationSource(source: unknown): boolean {
  return (
    source === SHIFT_REMINDER_SOURCE ||
    source === SHIFT_END_REMINDER_SOURCE ||
    source === DAY_BEFORE_REMINDER_SOURCE ||
    source === HOLIDAY_LEAVE_REMINDER_SOURCE
  );
}

async function clearPendingShiftReminders(uid: string): Promise<void> {
  const pending = await LocalNotifications.getPending();
  const reminderIds = pending.notifications
    .filter(
      (notification) =>
        notification.extra?.uid === uid && isManagedNotificationSource(notification.extra?.source),
    )
    .map((notification) => ({ id: notification.id }));

  if (reminderIds.length === 0) {
    return;
  }

  await LocalNotifications.cancel({ notifications: reminderIds });
}

export async function clearShiftReminderNotifications(uid: string): Promise<void> {
  if (!isShiftReminderRuntimeSupported()) {
    return;
  }

  await clearPendingShiftReminders(uid);
}

export async function openExactAlarmSettings(): Promise<boolean> {
  if (!isAndroidNativePlatform()) {
    return false;
  }

  try {
    await LocalNotifications.changeExactNotificationSetting();
    return true;
  } catch (error) {
    console.warn("Unable to open exact alarm settings.", error);
    return false;
  }
}

function buildLeadLabel(value: number, unit: ShiftReminderPreferences["shiftReminderUnit"]): string {
  const unitLabel = unit === "hours" ? "hour" : "minute";
  const normalizedValue = clampReminderValue(value);
  const suffix = normalizedValue === 1 ? unitLabel : `${unitLabel}s`;
  return `${normalizedValue} ${suffix}`;
}

function normalizeDisplayName(displayName: string): string {
  const trimmed = displayName.trim();
  return trimmed.length > 0 ? trimmed : "there";
}

function buildDayBeforeReminderBody(
  entry: RotaEntry,
  preferences: ShiftReminderPreferences,
  displayName: string,
): string {
  const name = normalizeDisplayName(displayName);

  if (entry.type === "shift") {
    const shiftTime = formatTimeValue(entry.startTime, preferences.timeFormat);
    return `Hey ${name}, you have shift tomorrow at ${shiftTime}.`;
  }

  if (entry.type === "holiday") {
    return `Hey ${name}, it is holiday tomorrow. Enjoy your day.`;
  }

  if (entry.type === "leave") {
    return `Hey ${name}, you have leave tomorrow. Enjoy your day.`;
  }

  return `Hey ${name}, you have an entry tomorrow.`;
}

function buildSameDayReminderBody(
  entry: RotaEntry,
  preferences: ShiftReminderPreferences,
  displayName: string,
): string {
  const name = normalizeDisplayName(displayName);

  if (entry.type === "shift") {
    return `Hey ${name}, you have shift today at ${formatTimeValue(entry.startTime, preferences.timeFormat)}.`;
  }

  if (entry.type === "holiday") {
    return `Hey ${name}, it is holiday today. Enjoy your day.`;
  }

  return `Hey ${name}, you have leave today.`;
}

export function isShiftReminderRuntimeSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("LocalNotifications");
}

function isAndroidNativePlatform(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

async function ensureShiftReminderChannel(): Promise<void> {
  if (!isAndroidNativePlatform()) {
    return;
  }

  // Best-effort cleanup for older channel configs that may have been muted or misconfigured on device.
  try {
    await LocalNotifications.deleteChannel({ id: LEGACY_SHIFT_REMINDER_CHANNEL_ID });
  } catch {
    // Ignore: channel might not exist or could be protected by OS/device policy.
  }

  await LocalNotifications.createChannel({
    id: SHIFT_REMINDER_CHANNEL_ID,
    name: SHIFT_REMINDER_CHANNEL_NAME,
    description: "Shift and rota reminders",
    importance: 5,
    visibility: 1,
    vibration: true,
  });
}

export async function syncShiftReminderNotifications(
  uid: string,
  entries: RotaEntry[],
  preferences: ShiftReminderPreferences,
  displayName: string,
): Promise<ShiftReminderSyncResult> {
  if (!isShiftReminderRuntimeSupported()) {
    return { status: "unsupported" };
  }

  if (
    !preferences.shiftReminderEnabled &&
    !preferences.shiftEndReminderEnabled &&
    !preferences.dayBeforeReminderEnabled &&
    !preferences.holidayLeaveReminderEnabled
  ) {
    await clearPendingShiftReminders(uid);
    return { status: "disabled" };
  }

  const permissions = await LocalNotifications.checkPermissions();
  const displayPermission =
    permissions.display === "granted"
      ? permissions.display
      : (await LocalNotifications.requestPermissions()).display;

  if (displayPermission !== "granted") {
    return { status: "permission-denied" };
  }

  let exactAlarmDenied = false;
  if (isAndroidNativePlatform()) {
    const settings = await LocalNotifications.checkExactNotificationSetting();
    exactAlarmDenied = settings.exact_alarm !== "granted";
  }

  await ensureShiftReminderChannel();

  const now = new Date();
  const leadMinutes = getLeadMinutes(preferences.shiftReminderValue, preferences.shiftReminderUnit);
  const leadLabel = buildLeadLabel(preferences.shiftReminderValue, preferences.shiftReminderUnit);
  const shiftEndLeadMinutes = getLeadMinutes(preferences.shiftEndReminderValue, preferences.shiftEndReminderUnit);
  const shiftEndLeadLabel = buildLeadLabel(preferences.shiftEndReminderValue, preferences.shiftEndReminderUnit);
  const dayBeforeReminderTime = preferences.dayBeforeReminderTime;
  const holidayLeaveReminderTime = preferences.holidayLeaveReminderTime;

  const shiftLeadNotifications = preferences.shiftReminderEnabled
    ? entries
        .map((entry) => {
          if (entry.type !== "shift") {
            return null;
          }

          const shiftStartDate = parseShiftStartDate(entry.date, entry.startTime);

          if (!shiftStartDate) {
            return null;
          }

          const triggerAt = new Date(shiftStartDate.getTime() - leadMinutes * 60 * 1000);
          const nextTriggerAt = resolveTriggerAt(triggerAt, now);

          if (!nextTriggerAt) {
            return null;
          }

          return {
            id: hashToNotificationId(
              `${uid}|lead|${entry.id}|${entry.date}|${entry.startTime ?? ""}|${leadMinutes}`,
            ),
            title: `${entry.title} in ${leadLabel}`,
            body: `${formatDateDayMonthYear(entry.date)} at ${formatTimeValue(entry.startTime, preferences.timeFormat)} • ${APP_NAME}`,
            sound: "default",
            channelId: SHIFT_REMINDER_CHANNEL_ID,
            schedule: { at: nextTriggerAt, allowWhileIdle: true },
            extra: {
              source: SHIFT_REMINDER_SOURCE,
              uid,
              entryId: entry.id,
              date: entry.date,
              startTime: entry.startTime,
            },
          };
        })
        .filter((notification): notification is NonNullable<typeof notification> => Boolean(notification))
    : [];

  const shiftEndNotifications = preferences.shiftEndReminderEnabled
    ? entries
        .map((entry) => {
          if (entry.type !== "shift") {
            return null;
          }

          const shiftEndDate = parseShiftEndDate(entry.date, entry.endTime);

          if (!shiftEndDate) {
            return null;
          }

          const triggerAt = new Date(shiftEndDate.getTime() - shiftEndLeadMinutes * 60 * 1000);
          const nextTriggerAt = resolveTriggerAt(triggerAt, now);

          if (!nextTriggerAt) {
            return null;
          }

          return {
            id: hashToNotificationId(
              `${uid}|end-lead|${entry.id}|${entry.date}|${entry.endTime ?? ""}|${shiftEndLeadMinutes}`,
            ),
            title: `${entry.title} ends in ${shiftEndLeadLabel}`,
            body: `${formatDateDayMonthYear(entry.date)} at ${formatTimeValue(entry.endTime, preferences.timeFormat)} • ${APP_NAME}`,
            sound: "default",
            channelId: SHIFT_REMINDER_CHANNEL_ID,
            schedule: { at: nextTriggerAt, allowWhileIdle: true },
            extra: {
              source: SHIFT_END_REMINDER_SOURCE,
              uid,
              entryId: entry.id,
              date: entry.date,
              endTime: entry.endTime,
            },
          };
        })
        .filter((notification): notification is NonNullable<typeof notification> => Boolean(notification))
    : [];

  const dayBeforeNotifications = preferences.dayBeforeReminderEnabled
    ? entries
        .map((entry) => {
          if (entry.type === "off") {
            return null;
          }

          const reminderDateKey = toDateKey(addDays(parseDateKey(entry.date), -1));
          const triggerAt = parseDateTime(reminderDateKey, dayBeforeReminderTime);
          const nextTriggerAt = triggerAt ? resolveTriggerAt(triggerAt, now) : null;

          if (!nextTriggerAt) {
            return null;
          }

          return {
            id: hashToNotificationId(
              `${uid}|day-before|${entry.id}|${entry.date}|${entry.type}|${dayBeforeReminderTime}`,
            ),
            title: `${entry.title} tomorrow`,
            body: buildDayBeforeReminderBody(entry, preferences, displayName),
            sound: "default",
            channelId: SHIFT_REMINDER_CHANNEL_ID,
            schedule: { at: nextTriggerAt, allowWhileIdle: true },
            extra: {
              source: DAY_BEFORE_REMINDER_SOURCE,
              uid,
              entryId: entry.id,
              date: entry.date,
            },
          };
        })
        .filter((notification): notification is NonNullable<typeof notification> => Boolean(notification))
    : [];

  const holidayLeaveNotifications = preferences.holidayLeaveReminderEnabled
    ? entries
        .map((entry) => {
          const allowShiftSameDayReminder = entry.type === "shift" && !preferences.shiftReminderEnabled;
          if (entry.type !== "holiday" && entry.type !== "leave" && !allowShiftSameDayReminder) {
            return null;
          }

          const triggerAt = parseDateTime(entry.date, holidayLeaveReminderTime);
          const nextTriggerAt = triggerAt ? resolveTriggerAt(triggerAt, now) : null;

          if (!nextTriggerAt) {
            return null;
          }

          return {
            id: hashToNotificationId(
              `${uid}|holiday-leave|${entry.id}|${entry.date}|${entry.type}|${holidayLeaveReminderTime}`,
            ),
            title: entry.type === "holiday" ? "Holiday today" : entry.type === "leave" ? "Leave today" : "Shift today",
            body: buildSameDayReminderBody(entry, preferences, displayName),
            sound: "default",
            channelId: SHIFT_REMINDER_CHANNEL_ID,
            schedule: { at: nextTriggerAt, allowWhileIdle: true },
            extra: {
              source: HOLIDAY_LEAVE_REMINDER_SOURCE,
              uid,
              entryId: entry.id,
              date: entry.date,
            },
          };
        })
        .filter((notification): notification is NonNullable<typeof notification> => Boolean(notification))
    : [];

  const notifications = [...shiftLeadNotifications, ...shiftEndNotifications, ...dayBeforeNotifications, ...holidayLeaveNotifications]
    .sort((a, b) => (a.schedule.at?.getTime() ?? 0) - (b.schedule.at?.getTime() ?? 0))
    .slice(0, MAX_SCHEDULED_SHIFT_REMINDERS);

  await clearPendingShiftReminders(uid);

  if (notifications.length > 0) {
    await LocalNotifications.schedule({ notifications });
  }

  return {
    status: "scheduled",
    scheduledCount: notifications.length,
    exactAlarmDenied,
  };
}

export async function scheduleShiftReminderTestNotification(displayName: string): Promise<ShiftReminderTestResult> {
  if (!isShiftReminderRuntimeSupported()) {
    return { status: "unsupported" };
  }

  const permissions = await LocalNotifications.checkPermissions();
  const displayPermission =
    permissions.display === "granted"
      ? permissions.display
      : (await LocalNotifications.requestPermissions()).display;

  if (displayPermission !== "granted") {
    return { status: "permission-denied" };
  }

  let exactAlarmDenied = false;
  if (isAndroidNativePlatform()) {
    const settings = await LocalNotifications.checkExactNotificationSetting();
    exactAlarmDenied = settings.exact_alarm !== "granted";
  }

  await ensureShiftReminderChannel();

  const triggerAt = new Date(Date.now() + 15_000);
  await LocalNotifications.schedule({
    notifications: [
      {
        id: hashToNotificationId(`test|${Date.now()}`),
        title: "Shift reminder test",
        body: `Hey ${normalizeDisplayName(displayName)}, this is a test notification from ShiftTracker.`,
        sound: "default",
        channelId: SHIFT_REMINDER_CHANNEL_ID,
        schedule: { at: triggerAt, allowWhileIdle: true },
        extra: {
          source: SHIFT_REMINDER_SOURCE,
          isTest: true,
        },
      },
    ],
  });

  return {
    status: "scheduled",
    triggerAt,
    exactAlarmDenied,
  };
}
