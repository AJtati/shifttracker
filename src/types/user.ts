export type DefaultView = "dashboard" | "weekly" | "monthly" | "list";
export type WeekStartsOn = "monday" | "sunday";
export type TimeFormat = "12h" | "24h";
export type ThemePreference = "light" | "dark";
export type ShiftReminderUnit = "minutes" | "hours";

export interface UserProfile {
  uid: string;
  fullName: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  defaultView: DefaultView;
  weekStartsOn: WeekStartsOn;
  timeFormat: TimeFormat;
  theme: ThemePreference;
  timezone: string;
  shiftReminderEnabled: boolean;
  shiftReminderValue: number;
  shiftReminderUnit: ShiftReminderUnit;
  dayBeforeReminderEnabled: boolean;
  dayBeforeReminderTime: string;
  holidayLeaveReminderEnabled: boolean;
  holidayLeaveReminderTime: string;
}

export interface UserPreferences {
  defaultView: DefaultView;
  weekStartsOn: WeekStartsOn;
  timeFormat: TimeFormat;
  theme: ThemePreference;
  timezone: string;
  shiftReminderEnabled: boolean;
  shiftReminderValue: number;
  shiftReminderUnit: ShiftReminderUnit;
  dayBeforeReminderEnabled: boolean;
  dayBeforeReminderTime: string;
  holidayLeaveReminderEnabled: boolean;
  holidayLeaveReminderTime: string;
}
