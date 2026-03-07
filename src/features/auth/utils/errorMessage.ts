import { FirebaseError } from "firebase/app";

import { toFriendlyFirebaseMessage } from "@/services/firebase/errors";

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  "auth/email-already-in-use": "An account with this email already exists.",
  "auth/invalid-credential": "Invalid email or password.",
  "auth/user-not-found": "No account was found for this email.",
  "auth/wrong-password": "Invalid email or password.",
  "auth/weak-password": "Password must be at least 8 characters.",
  "auth/operation-not-allowed": "Email/password sign-in is not enabled in Firebase Authentication.",
  "auth/configuration-not-found": "Firebase Authentication is not initialized for this project yet.",
  "auth/unauthorized-domain": "This domain is not authorized in Firebase Authentication settings.",
  "auth/invalid-api-key": "Invalid Firebase API key configuration.",
  "auth/too-many-requests": "Too many attempts. Please wait and try again.",
  "auth/network-request-failed": "Network error. Please check your connection.",
};

export function toFriendlyAuthError(error: unknown): string {
  if (error instanceof FirebaseError) {
    if (error.code.startsWith("auth/")) {
      return AUTH_ERROR_MESSAGES[error.code] ?? "Authentication failed. Please try again.";
    }

    return toFriendlyFirebaseMessage(error, "Firebase request failed.");
  }

  if (error instanceof Error) {
    if (error.message.includes("CONFIGURATION_NOT_FOUND")) {
      return "Firebase Authentication is not initialized for this project yet.";
    }

    return toFriendlyFirebaseMessage(error, error.message);
  }

  return "Something went wrong. Please try again.";
}
