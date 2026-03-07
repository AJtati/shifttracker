import { FirebaseAppError, isRecoverableFirebaseError, toFirebaseAppError } from "@/services/firebase/errors";

interface FirebaseRequestOptions {
  timeoutMs: number;
  retries?: number;
  retryDelayMs?: number;
  fallbackMessage: string;
}

const FIRESTORE_READ_TIMEOUT_MS = 10000;
const FIRESTORE_WRITE_TIMEOUT_MS = 15000;
const FIRESTORE_DISABLED_COOLDOWN_MS = 5 * 60 * 1000;
const FIRESTORE_UNAVAILABLE_COOLDOWN_MS = 20 * 1000;

let firestoreDisabledUntil = 0;
let firestoreUnavailableUntil = 0;

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function getCircuitBreakerError(): FirebaseAppError | null {
  const now = Date.now();

  if (now < firestoreDisabledUntil) {
    return new FirebaseAppError("firestore-disabled");
  }

  if (now < firestoreUnavailableUntil) {
    return new FirebaseAppError("unavailable");
  }

  return null;
}

function updateCircuitBreakerState(error: FirebaseAppError): void {
  const now = Date.now();

  if (error.code === "firestore-disabled") {
    firestoreDisabledUntil = now + FIRESTORE_DISABLED_COOLDOWN_MS;
  }

  if (error.code === "unavailable" || error.code === "network" || error.code === "timeout") {
    firestoreUnavailableUntil = now + FIRESTORE_UNAVAILABLE_COOLDOWN_MS;
  }
}

async function withTimeout<T>(request: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new FirebaseAppError("timeout"));
    }, timeoutMs);
  });

  try {
    return await Promise.race([request, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function runFirebaseRequest<T>(
  requestFactory: () => Promise<T>,
  options: FirebaseRequestOptions,
): Promise<T> {
  const breakerError = getCircuitBreakerError();

  if (breakerError) {
    throw breakerError;
  }

  const retries = options.retries ?? 0;
  const retryDelayMs = options.retryDelayMs ?? 250;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await withTimeout(requestFactory(), options.timeoutMs);
    } catch (error) {
      const normalizedError = toFirebaseAppError(error, options.fallbackMessage);
      updateCircuitBreakerState(normalizedError);
      const shouldRetry = attempt < retries && isRecoverableFirebaseError(normalizedError);

      if (!shouldRetry) {
        throw normalizedError;
      }

      await sleep(retryDelayMs * (attempt + 1));
    }
  }

  throw new FirebaseAppError("unknown", options.fallbackMessage);
}

export function runFirestoreRead<T>(
  requestFactory: () => Promise<T>,
  fallbackMessage = "Unable to load Firebase data.",
): Promise<T> {
  return runFirebaseRequest(requestFactory, {
    timeoutMs: FIRESTORE_READ_TIMEOUT_MS,
    retries: 1,
    retryDelayMs: 400,
    fallbackMessage,
  });
}

export function runFirestoreWrite<T>(
  requestFactory: () => Promise<T>,
  fallbackMessage = "Unable to save Firebase data.",
): Promise<T> {
  return runFirebaseRequest(requestFactory, {
    timeoutMs: FIRESTORE_WRITE_TIMEOUT_MS,
    retries: 1,
    retryDelayMs: 500,
    fallbackMessage,
  });
}
