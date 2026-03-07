"use client";

import { useState } from "react";

import { GradientButton } from "@/components/common/GradientButton";
import { UserPreferences, UserProfile } from "@/types/user";

interface PreferencesFormProps {
  profile: UserProfile;
  isSaving: boolean;
  onSave: (preferences: UserPreferences) => Promise<void>;
}

export function PreferencesForm({ profile, isSaving, onSave }: PreferencesFormProps) {
  const [preferences, setPreferences] = useState<UserPreferences>({
    defaultView: profile.defaultView,
    weekStartsOn: profile.weekStartsOn,
    timeFormat: profile.timeFormat,
    theme: profile.theme,
    timezone: profile.timezone,
    shiftReminderEnabled: profile.shiftReminderEnabled,
    shiftReminderValue: profile.shiftReminderValue,
    shiftReminderUnit: profile.shiftReminderUnit,
    dayBeforeReminderEnabled: profile.dayBeforeReminderEnabled,
    dayBeforeReminderTime: profile.dayBeforeReminderTime,
    holidayLeaveReminderEnabled: profile.holidayLeaveReminderEnabled,
    holidayLeaveReminderTime: profile.holidayLeaveReminderTime,
  });

  return (
    <form
      className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(preferences);
      }}
    >
      <h2 className="text-xl font-black text-slate-900">Preferences</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold text-slate-700">
          Default view
          <select
            value={preferences.defaultView}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                defaultView: event.target.value as UserPreferences["defaultView"],
              }))
            }
            className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-500"
          >
            <option value="dashboard">Dashboard</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="list">List</option>
          </select>
        </label>

        <label className="space-y-1 text-sm font-semibold text-slate-700">
          Week starts on
          <select
            value={preferences.weekStartsOn}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                weekStartsOn: event.target.value as UserPreferences["weekStartsOn"],
              }))
            }
            className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-500"
          >
            <option value="monday">Monday</option>
            <option value="sunday">Sunday</option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold text-slate-700">
          Time format
          <select
            value={preferences.timeFormat}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                timeFormat: event.target.value as UserPreferences["timeFormat"],
              }))
            }
            className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-500"
          >
            <option value="24h">24 hour</option>
            <option value="12h">12 hour</option>
          </select>
        </label>

        <label className="space-y-1 text-sm font-semibold text-slate-700">
          Theme
          <select
            value={preferences.theme}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                theme: event.target.value as UserPreferences["theme"],
              }))
            }
            className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-500"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>

        <label className="space-y-1 text-sm font-semibold text-slate-700">
          Timezone
          <input
            type="text"
            value={preferences.timezone}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                timezone: event.target.value,
              }))
            }
            className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-500"
          />
        </label>
      </div>

      <div className="space-y-2 rounded-2xl border border-slate-200 p-4">
        <p className="text-sm font-black text-slate-900">Shift reminder notifications</p>
        <p className="text-xs font-semibold text-slate-500">Mobile app only. Alerts will trigger before each shift.</p>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="space-y-1 text-sm font-semibold text-slate-700">
            Status
            <select
              value={preferences.shiftReminderEnabled ? "on" : "off"}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  shiftReminderEnabled: event.target.value === "on",
                }))
              }
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-500"
            >
              <option value="off">Off</option>
              <option value="on">On</option>
            </select>
          </label>

          <label className="space-y-1 text-sm font-semibold text-slate-700">
            Value
            <input
              type="number"
              min={1}
              max={10080}
              value={preferences.shiftReminderValue}
              disabled={!preferences.shiftReminderEnabled}
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value, 10);

                setPreferences((current) => ({
                  ...current,
                  shiftReminderValue:
                    Number.isFinite(parsed) && parsed > 0
                      ? Math.min(10080, parsed)
                      : current.shiftReminderValue,
                }));
              }}
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            />
          </label>

          <label className="space-y-1 text-sm font-semibold text-slate-700">
            Unit
            <select
              value={preferences.shiftReminderUnit}
              disabled={!preferences.shiftReminderEnabled}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  shiftReminderUnit: event.target.value as UserPreferences["shiftReminderUnit"],
                }))
              }
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            >
              <option value="minutes">Minutes</option>
              <option value="hours">Hours</option>
            </select>
          </label>
        </div>
      </div>

      <div className="space-y-2 rounded-2xl border border-slate-200 p-4">
        <p className="text-sm font-black text-slate-900">Day-before reminder notifications</p>
        <p className="text-xs font-semibold text-slate-500">
          Mobile app only. Sends a reminder one day before shift, holiday, and leave entries.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-semibold text-slate-700">
            Status
            <select
              value={preferences.dayBeforeReminderEnabled ? "on" : "off"}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  dayBeforeReminderEnabled: event.target.value === "on",
                }))
              }
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-500"
            >
              <option value="off">Off</option>
              <option value="on">On</option>
            </select>
          </label>

          <label className="min-w-0 space-y-1 text-sm font-semibold text-slate-700">
            Notify at (previous day)
            <div className="overflow-hidden rounded-xl border border-slate-200 focus-within:border-blue-500">
              <input
                type="time"
                step={60}
                value={preferences.dayBeforeReminderTime}
                disabled={!preferences.dayBeforeReminderEnabled}
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    dayBeforeReminderTime: event.target.value || current.dayBeforeReminderTime,
                  }))
                }
                className="h-11 min-w-0 w-full max-w-full border-0 px-3 text-sm font-semibold text-slate-700 outline-none transition disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              />
            </div>
          </label>
        </div>
      </div>

      <div className="space-y-2 rounded-2xl border border-slate-200 p-4">
        <p className="text-sm font-black text-slate-900">Holiday and leave day reminders</p>
        <p className="text-xs font-semibold text-slate-500">
          Mobile app only. Sends reminders on the same holiday or leave date.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-semibold text-slate-700">
            Status
            <select
              value={preferences.holidayLeaveReminderEnabled ? "on" : "off"}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  holidayLeaveReminderEnabled: event.target.value === "on",
                }))
              }
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-500"
            >
              <option value="off">Off</option>
              <option value="on">On</option>
            </select>
          </label>

          <label className="min-w-0 space-y-1 text-sm font-semibold text-slate-700">
            Notify at (same day)
            <div className="overflow-hidden rounded-xl border border-slate-200 focus-within:border-blue-500">
              <input
                type="time"
                step={60}
                value={preferences.holidayLeaveReminderTime}
                disabled={!preferences.holidayLeaveReminderEnabled}
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    holidayLeaveReminderTime: event.target.value || current.holidayLeaveReminderTime,
                  }))
                }
                className="h-11 min-w-0 w-full max-w-full border-0 px-3 text-sm font-semibold text-slate-700 outline-none transition disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              />
            </div>
          </label>
        </div>
      </div>

      <GradientButton type="submit" disabled={isSaving}>
        {isSaving ? "Saving..." : "Save preferences"}
      </GradientButton>
    </form>
  );
}
