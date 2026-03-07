"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { useToast } from "@/app/providers/ToastProvider";
import { GradientButton } from "@/components/common/GradientButton";
import { LoadingState } from "@/components/common/LoadingState";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { PreferencesForm } from "@/features/user/components/PreferencesForm";
import { ProfileDetailsForm } from "@/features/user/components/ProfileDetailsForm";
import { usePreferences } from "@/hooks/usePreferences";
import { useUserProfile } from "@/hooks/useUserProfile";
import { UserProfile } from "@/types/user";
import { DEFAULT_PREFERENCES } from "@/utils/constants";

export default function ProfilePage() {
  const router = useRouter();
  const { user, profile, signOutUser } = useAuth();
  const {
    savePreferences,
    isSaving: isSavingPreferences,
    error: preferencesError,
  } = usePreferences();
  const { saveProfileDetails, isSaving: isSavingProfile, error: profileError } = useUserProfile();
  const { pushToast } = useToast();

  const resolvedProfile = useMemo<UserProfile | null>(() => {
    if (!user && !profile) {
      return null;
    }

    const now = new Date().toISOString();

    return {
      uid: profile?.uid ?? user?.uid ?? "",
      fullName: profile?.fullName ?? user?.displayName ?? "User",
      email: profile?.email ?? user?.email ?? "",
      createdAt: profile?.createdAt ?? now,
      updatedAt: profile?.updatedAt ?? now,
      defaultView: profile?.defaultView ?? DEFAULT_PREFERENCES.defaultView,
      weekStartsOn: profile?.weekStartsOn ?? DEFAULT_PREFERENCES.weekStartsOn,
      timeFormat: profile?.timeFormat ?? DEFAULT_PREFERENCES.timeFormat,
      theme: profile?.theme ?? DEFAULT_PREFERENCES.theme,
      timezone: profile?.timezone ?? DEFAULT_PREFERENCES.timezone,
      shiftReminderEnabled: profile?.shiftReminderEnabled ?? DEFAULT_PREFERENCES.shiftReminderEnabled,
      shiftReminderValue: profile?.shiftReminderValue ?? DEFAULT_PREFERENCES.shiftReminderValue,
      shiftReminderUnit: profile?.shiftReminderUnit ?? DEFAULT_PREFERENCES.shiftReminderUnit,
      dayBeforeReminderEnabled: profile?.dayBeforeReminderEnabled ?? DEFAULT_PREFERENCES.dayBeforeReminderEnabled,
      dayBeforeReminderTime: profile?.dayBeforeReminderTime ?? DEFAULT_PREFERENCES.dayBeforeReminderTime,
      holidayLeaveReminderEnabled:
        profile?.holidayLeaveReminderEnabled ?? DEFAULT_PREFERENCES.holidayLeaveReminderEnabled,
      holidayLeaveReminderTime: profile?.holidayLeaveReminderTime ?? DEFAULT_PREFERENCES.holidayLeaveReminderTime,
    };
  }, [profile, user]);

  if (!resolvedProfile) {
    return <LoadingState label="Loading profile..." />;
  }

  const handleLogout = async () => {
    try {
      await signOutUser();
      router.push("/login");
      pushToast("Logged out successfully.", "success");
    } catch (logoutError) {
      const message = logoutError instanceof Error ? logoutError.message : "Unable to log out.";
      pushToast(message, "error");
    }
  };

  return (
    <div className="grid gap-4 pb-20 md:grid-cols-[1fr_1.2fr] md:pb-0">
      <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-black text-slate-900">Profile</h1>

        <div className="rounded-2xl bg-gradient-to-r from-blue-600 to-sky-400 p-4 text-white">
          <p className="text-2xl font-black">{resolvedProfile.fullName}</p>
          <p className="mt-1 text-sm font-semibold text-white/90">{resolvedProfile.email}</p>
        </div>

        <dl className="space-y-2 text-sm">
          <div className="flex justify-between rounded-xl border border-slate-200 px-3 py-2">
            <dt className="font-semibold text-slate-600">Member since</dt>
            <dd className="font-bold text-slate-800">{new Date(resolvedProfile.createdAt).toLocaleDateString()}</dd>
          </div>
          <div className="flex justify-between rounded-xl border border-slate-200 px-3 py-2">
            <dt className="font-semibold text-slate-600">Default view</dt>
            <dd className="font-bold text-slate-800 capitalize">{resolvedProfile.defaultView}</dd>
          </div>
          <div className="flex justify-between rounded-xl border border-slate-200 px-3 py-2">
            <dt className="font-semibold text-slate-600">Time format</dt>
            <dd className="font-bold text-slate-800">{resolvedProfile.timeFormat}</dd>
          </div>
          <div className="flex justify-between rounded-xl border border-slate-200 px-3 py-2">
            <dt className="font-semibold text-slate-600">Theme</dt>
            <dd className="font-bold text-slate-800 capitalize">{resolvedProfile.theme}</dd>
          </div>
          <div className="flex justify-between rounded-xl border border-slate-200 px-3 py-2">
            <dt className="font-semibold text-slate-600">Shift reminders</dt>
            <dd className="font-bold text-slate-800">
              {resolvedProfile.shiftReminderEnabled
                ? `${resolvedProfile.shiftReminderValue} ${resolvedProfile.shiftReminderUnit} before`
                : "Off"}
            </dd>
          </div>
          <div className="flex justify-between rounded-xl border border-slate-200 px-3 py-2">
            <dt className="font-semibold text-slate-600">Day-before reminder</dt>
            <dd className="font-bold text-slate-800">
              {resolvedProfile.dayBeforeReminderEnabled ? resolvedProfile.dayBeforeReminderTime : "Off"}
            </dd>
          </div>
          <div className="flex justify-between rounded-xl border border-slate-200 px-3 py-2">
            <dt className="font-semibold text-slate-600">Holiday/leave reminder</dt>
            <dd className="font-bold text-slate-800">
              {resolvedProfile.holidayLeaveReminderEnabled ? resolvedProfile.holidayLeaveReminderTime : "Off"}
            </dd>
          </div>
        </dl>

        <GradientButton type="button" tone="orange" onClick={handleLogout}>
          Logout
        </GradientButton>
      </section>

      <div className="space-y-3">
        <ProfileDetailsForm
          fullName={resolvedProfile.fullName}
          email={resolvedProfile.email}
          isSaving={isSavingProfile}
          onSave={async (fullName) => {
            try {
              await saveProfileDetails(fullName);
              pushToast("Profile updated.", "success");
            } catch (saveError) {
              const message = saveError instanceof Error ? saveError.message : "Unable to save profile.";
              pushToast(message, "error");
            }
          }}
        />

        <PreferencesForm
          key={resolvedProfile.updatedAt}
          profile={resolvedProfile}
          isSaving={isSavingPreferences}
          onSave={async (preferences) => {
            try {
              await savePreferences(preferences);
              pushToast("Preferences updated.", "success");
            } catch (saveError) {
              const message = saveError instanceof Error ? saveError.message : "Unable to save preferences.";
              pushToast(message, "error");
            }
          }}
        />

        {profileError ? (
          <p className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{profileError}</p>
        ) : null}
        {preferencesError ? (
          <p className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{preferencesError}</p>
        ) : null}
      </div>
    </div>
  );
}
