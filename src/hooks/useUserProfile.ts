"use client";

import { useCallback, useState } from "react";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { updateAuthDisplayName } from "@/features/auth/services/authService";
import { updateUserProfileDetails } from "@/features/user/services/userService";

export function useUserProfile() {
  const { user, refreshProfile } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveProfileDetails = useCallback(
    async (fullName: string) => {
      if (!user) {
        throw new Error("You must be logged in to update your profile.");
      }

      const normalizedFullName = fullName.trim();

      if (!normalizedFullName) {
        throw new Error("Full name is required.");
      }

      setIsSaving(true);
      setError(null);

      try {
        await updateUserProfileDetails(user.uid, { fullName: normalizedFullName });
        await updateAuthDisplayName(normalizedFullName);
        try {
          await refreshProfile();
        } catch {
          // Details update already completed; avoid blocking UX on a follow-up refresh failure.
        }
      } catch (saveError) {
        const message = saveError instanceof Error ? saveError.message : "Unable to update profile details.";
        setError(message);
        throw new Error(message);
      } finally {
        setIsSaving(false);
      }
    },
    [refreshProfile, user],
  );

  return {
    isSaving,
    error,
    saveProfileDetails,
  };
}
