"use client";

import { useCallback, useState } from "react";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { updatePreferences } from "@/features/user/services/userService";
import { UserPreferences } from "@/types/user";

export function usePreferences() {
  const { user, profile, refreshProfile } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const savePreferences = useCallback(
    async (preferences: UserPreferences) => {
      if (!user) {
        throw new Error("You must be logged in to update preferences.");
      }

      setIsSaving(true);
      setError(null);

      try {
        await updatePreferences(user.uid, preferences);
        try {
          await refreshProfile();
        } catch {
          // Preference update already completed; avoid blocking UX on a follow-up refresh failure.
        }
      } catch (saveError) {
        const message = saveError instanceof Error ? saveError.message : "Unable to update preferences.";
        setError(message);
        throw new Error(message);
      } finally {
        setIsSaving(false);
      }
    },
    [refreshProfile, user],
  );

  return {
    preferences: profile,
    isSaving,
    error,
    savePreferences,
  };
}
