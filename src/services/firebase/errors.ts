import { FirebaseError } from "firebase/app";

export type FirebaseAppErrorCode =
  | "config-missing"
  | "timeout"
  | "firestore-disabled"
  | "permission-denied"
  | "unauthenticated"
  | "unavailable"
  | "network"
  | "failed-precondition"
  | "unknown";

const FRIENDLY_FIREBASE_MESSAGES: Record<FirebaseAppErrorCode, string> = {
  "config-missing": "Firebase is not configured. Check NEXT_PUBLIC_FIREBASE_* environment values.",
  timeout: "Firebase request timed out. Please try again.",
  "firestore-disabled": "Cloud Firestore is not enabled in this Firebase project yet.",
  "permission-denied": "Access denied. Check Firestore Security Rules for this user.",
  unauthenticated: "You are signed out. Please log in again.",
  unavailable: "Firebase service is temporarily unavailable. Please try again shortly.",
  network: "Network error while contacting Firebase.",
  "failed-precondition": "Firestore is not fully configured yet.",
  unknown: "Firebase request failed.",
};

const RECOVERABLE_ERROR_CODES = new Set<FirebaseAppErrorCode>([
  "timeout",
  "firestore-disabled",
  "unavailable",
  "network",
  "failed-precondition",
]);

const FIRESTORE_DISABLED_PATTERNS = [
  "cloud firestore api has not been used",
  "service_disabled",
  "firestore.googleapis.com",
  "enable firestore api",
];

const FIRESTORE_PERMISSION_PATTERNS = [
  "missing or insufficient permissions",
  "insufficient permissions",
  "permission denied",
];

const FIRESTORE_FAILED_PRECONDITION_PATTERNS = [
  "requires an index",
  "build the index",
  "failed precondition",
];

export class FirebaseConfigError extends Error {
  constructor() {
    super(
      "Firebase is not configured. Add NEXT_PUBLIC_FIREBASE_* variables to your environment and restart the app.",
    );
    this.name = "FirebaseConfigError";
  }
}

export class FirebaseAppError extends Error {
  code: FirebaseAppErrorCode;
  rawCode?: string;
  isRecoverable: boolean;

  constructor(code: FirebaseAppErrorCode, message?: string, rawCode?: string) {
    super(message ?? FRIENDLY_FIREBASE_MESSAGES[code]);
    this.name = "FirebaseAppError";
    this.code = code;
    this.rawCode = rawCode;
    this.isRecoverable = RECOVERABLE_ERROR_CODES.has(code);
  }
}

function isFirestoreDisabledMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return FIRESTORE_DISABLED_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function isPermissionDeniedMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return FIRESTORE_PERMISSION_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function isFailedPreconditionMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return FIRESTORE_FAILED_PRECONDITION_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function normalizeFirebaseErrorCode(rawCode: string, message: string): FirebaseAppErrorCode {
  const normalizedRawCode = rawCode.toLowerCase().replace(/^.*\//, "");

  if (normalizedRawCode === "permission-denied" || isPermissionDeniedMessage(message)) {
    return "permission-denied";
  }

  if (normalizedRawCode === "unauthenticated") {
    return "unauthenticated";
  }

  if (normalizedRawCode === "unavailable" || normalizedRawCode === "resource-exhausted") {
    return "unavailable";
  }

  if (normalizedRawCode === "failed-precondition" || isFailedPreconditionMessage(message)) {
    return "failed-precondition";
  }

  if (normalizedRawCode === "deadline-exceeded") {
    return "timeout";
  }

  if (rawCode.toLowerCase() === "auth/network-request-failed") {
    return "network";
  }

  if (rawCode.toLowerCase().startsWith("auth/")) {
    return "unknown";
  }

  if (isFirestoreDisabledMessage(message)) {
    return "firestore-disabled";
  }

  return "unknown";
}

export function toFirebaseAppError(error: unknown, fallbackMessage = "Firebase request failed."): FirebaseAppError {
  if (error instanceof FirebaseAppError) {
    return error;
  }

  if (error instanceof FirebaseConfigError) {
    return new FirebaseAppError("config-missing", error.message);
  }

  if (error instanceof FirebaseError) {
    const mappedCode = normalizeFirebaseErrorCode(error.code, error.message);
    const friendlyMessage = mappedCode === "unknown" ? fallbackMessage : FRIENDLY_FIREBASE_MESSAGES[mappedCode];
    return new FirebaseAppError(mappedCode, friendlyMessage, error.code);
  }

  if (error instanceof Error) {
    if (error.message === "REQUEST_TIMEOUT") {
      return new FirebaseAppError("timeout", FRIENDLY_FIREBASE_MESSAGES.timeout);
    }

    if (isFirestoreDisabledMessage(error.message)) {
      return new FirebaseAppError("firestore-disabled", FRIENDLY_FIREBASE_MESSAGES["firestore-disabled"]);
    }

    if (error.message.toLowerCase().includes("network")) {
      return new FirebaseAppError("network", FRIENDLY_FIREBASE_MESSAGES.network);
    }

    return new FirebaseAppError("unknown", error.message || fallbackMessage);
  }

  return new FirebaseAppError("unknown", fallbackMessage);
}

export function toFriendlyFirebaseMessage(error: unknown, fallbackMessage = "Firebase request failed."): string {
  return toFirebaseAppError(error, fallbackMessage).message;
}

export function isRecoverableFirebaseError(error: unknown): boolean {
  return toFirebaseAppError(error).isRecoverable;
}

export function isFirestoreSetupError(error: unknown): boolean {
  return toFirebaseAppError(error).code === "firestore-disabled";
}
