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

      <GradientButton type="submit" disabled={isSaving}>
        {isSaving ? "Saving..." : "Save preferences"}
      </GradientButton>
    </form>
  );
}
