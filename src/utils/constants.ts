import { EntryType } from "@/types/entry";
import { DefaultView, ShiftReminderUnit, ThemePreference, TimeFormat, UserPreferences, WeekStartsOn } from "@/types/user";

export const APP_NAME = "ShifTracker";

export const ENTRY_TYPE_LABEL: Record<EntryType, string> = {
  shift: "Shift",
  leave: "Leave",
  holiday: "Holiday",
  off: "Off",
};

export const ENTRY_TYPE_COLOR: Record<EntryType, string> = {
  shift: "linear-gradient(135deg, #1777f2 0%, #59b7f8 100%)",
  leave: "linear-gradient(135deg, #f97316 0%, #fb7185 100%)",
  holiday: "linear-gradient(135deg, #16a34a 0%, #a3e635 100%)",
  off: "linear-gradient(135deg, #64748b 0%, #94a3b8 100%)",
};

export const DEFAULT_VIEW_ROUTE: Record<DefaultView, string> = {
  dashboard: "/dashboard",
  weekly: "/rota/weekly",
  monthly: "/rota/monthly",
  list: "/rota/list",
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  defaultView: "weekly",
  weekStartsOn: "monday",
  timeFormat: "24h",
  theme: "dark",
  timezone: "Europe/London",
  shiftReminderEnabled: false,
  shiftReminderValue: 15,
  shiftReminderUnit: "minutes",
  shiftEndReminderEnabled: false,
  shiftEndReminderValue: 15,
  shiftEndReminderUnit: "minutes",
  dayBeforeReminderEnabled: false,
  dayBeforeReminderTime: "21:00",
  holidayLeaveReminderEnabled: false,
  holidayLeaveReminderTime: "09:00",
};

export const VALID_DEFAULT_VIEWS: DefaultView[] = ["dashboard", "weekly", "monthly", "list"];
export const VALID_WEEK_STARTS_ON: WeekStartsOn[] = ["monday", "sunday"];
export const VALID_TIME_FORMATS: TimeFormat[] = ["12h", "24h"];
export const VALID_THEME_PREFERENCES: ThemePreference[] = ["light", "dark"];
export const VALID_SHIFT_REMINDER_UNITS: ShiftReminderUnit[] = ["minutes", "hours"];

export const VALID_ENTRY_TYPES: EntryType[] = ["shift", "leave", "holiday", "off"];

export const VALID_LEAVE_SUBTYPES = ["annual", "sick", "unpaid", "personal"] as const;
