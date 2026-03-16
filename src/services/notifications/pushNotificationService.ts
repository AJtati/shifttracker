import { Capacitor } from "@capacitor/core";
import { PushNotifications, PushNotificationSchema } from "@capacitor/push-notifications";
import { collection, doc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";

import { db } from "@/services/firebase/client";
import { runFirestoreRead, runFirestoreWrite } from "@/services/firebase/request";
import { FirebaseConfig } from "@/services/native/firebaseConfigPlugin";

const PUSH_TOKEN_STORAGE_KEY = "shifttracker:v1:pushToken";
const PUSH_REGISTRATION_TIMEOUT_MS = 15_000;

type PushRegistrationStatus =
  | "registered"
  | "unsupported"
  | "permission-denied"
  | "registration-failed"
  | "runtime-not-configured";

interface StoredPushToken {
  uid: string;
  token: string;
}

export interface PushDeliveryFailureDiagnostics {
  failureCode: string | null;
  updatedAt: Date | null;
}

let listenersAttached = false;
let activeUid: string | null = null;
let pushNotificationReceivedHandler: ((notification: PushNotificationSchema) => void) | null = null;
let pendingPushRegistrationResolver: ((status: PushRegistrationStatus) => void) | null = null;
let pendingPushRegistrationTimeoutId: ReturnType<typeof setTimeout> | null = null;
let lastPushRegistrationErrorMessage: string | null = null;

function getDbClient() {
  if (!db) {
    throw new Error("Firebase Firestore is not available.");
  }

  return db;
}

function isBrowserStorageAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readStoredPushToken(): StoredPushToken | null {
  if (!isBrowserStorageAvailable()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as StoredPushToken;
    return typeof parsed.uid === "string" && typeof parsed.token === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredPushToken(payload: StoredPushToken): void {
  if (!isBrowserStorageAvailable()) {
    return;
  }

  window.localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, JSON.stringify(payload));
}

function clearStoredPushToken(): void {
  if (!isBrowserStorageAvailable()) {
    return;
  }

  window.localStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
}

function hashToTokenId(input: string): string {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) | 0;
  }

  return `token-${Math.abs(hash)}`;
}

function tokenToDocumentId(token: string): string {
  const trimmed = token.trim();

  if (trimmed.length === 0) {
    throw new Error("Push token is empty.");
  }

  return hashToTokenId(trimmed);
}

function toDateOrNull(value: unknown): Date | null {
  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  return null;
}

function toErrorMessage(error: unknown): string | null {
  if (typeof error === "string") {
    return error;
  }

  if (!error || typeof error !== "object") {
    return null;
  }

  const directMessage = (error as { message?: unknown }).message;
  if (typeof directMessage === "string") {
    return directMessage;
  }

  const nestedError = (error as { error?: unknown }).error;
  if (typeof nestedError === "string") {
    return nestedError;
  }

  if (!nestedError || typeof nestedError !== "object") {
    return null;
  }

  const nestedMessage = (nestedError as { message?: unknown }).message;
  if (typeof nestedMessage === "string") {
    return nestedMessage;
  }

  const nestedNestedError = (nestedError as { error?: unknown }).error;
  return typeof nestedNestedError === "string" ? nestedNestedError : null;
}

function isIosPushRuntimeConfigurationError(errorMessage: string | null): boolean {
  if (!errorMessage) {
    return false;
  }

  const normalized = errorMessage.toLowerCase();
  return (
    normalized.includes("aps-environment") ||
    normalized.includes("not entitled") ||
    (normalized.includes("simulator") && normalized.includes("remote notifications are not supported"))
  );
}

function clearPendingPushRegistration(): void {
  pendingPushRegistrationResolver = null;

  if (!pendingPushRegistrationTimeoutId) {
    return;
  }

  clearTimeout(pendingPushRegistrationTimeoutId);
  pendingPushRegistrationTimeoutId = null;
}

function resolvePendingPushRegistration(status: PushRegistrationStatus): void {
  if (!pendingPushRegistrationResolver) {
    return;
  }

  const resolve = pendingPushRegistrationResolver;
  clearPendingPushRegistration();
  resolve(status);
}

function waitForPushRegistrationResult(runtimeConfigured: boolean): Promise<PushRegistrationStatus> {
  if (pendingPushRegistrationResolver) {
    resolvePendingPushRegistration(runtimeConfigured ? "registration-failed" : "runtime-not-configured");
  }

  return new Promise((resolve) => {
    pendingPushRegistrationResolver = resolve;
    pendingPushRegistrationTimeoutId = setTimeout(() => {
      resolvePendingPushRegistration(runtimeConfigured ? "registration-failed" : "runtime-not-configured");
    }, PUSH_REGISTRATION_TIMEOUT_MS);
  });
}

export function isPushNotificationRuntimeSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("PushNotifications");
}

function isAndroidFirebaseConfigPluginAvailable(): boolean {
  return (
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === "android" &&
    Capacitor.isPluginAvailable("FirebaseConfig")
  );
}

async function isNativePushRuntimeConfigured(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }

  if (Capacitor.getPlatform() !== "android") {
    return true;
  }

  if (!isAndroidFirebaseConfigPluginAvailable()) {
    console.warn("Android FirebaseConfig plugin is unavailable. Continuing with push registration.");
    return true;
  }

  try {
    const result = await FirebaseConfig.isPushRuntimeConfigured();
    return result.configured === true;
  } catch (error) {
    console.warn("Unable to confirm Android push runtime configuration. Continuing with registration.", error);
    return true;
  }
}

async function savePushToken(uid: string, token: string): Promise<void> {
  const tokenId = tokenToDocumentId(token);
  const tokenRef = doc(getDbClient(), "users", uid, "deviceTokens", tokenId);

  await runFirestoreWrite(
    () =>
      setDoc(
        tokenRef,
        {
          token,
          platform: Capacitor.getPlatform(),
          enabled: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastSeenAt: serverTimestamp(),
          disabledAt: null,
        },
        { merge: true },
      ),
    "Unable to register push token.",
  );

  writeStoredPushToken({ uid, token });
}

async function attachPushListeners(): Promise<void> {
  if (listenersAttached) {
    return;
  }

  await PushNotifications.addListener("registration", (token) => {
    lastPushRegistrationErrorMessage = null;

    if (!activeUid) {
      return;
    }

    void savePushToken(activeUid, token.value)
      .then(() => {
        resolvePendingPushRegistration("registered");
      })
      .catch((error) => {
        console.warn("Unable to save push token.", error);
        resolvePendingPushRegistration("registration-failed");
      });
  });

  await PushNotifications.addListener("registrationError", (error) => {
    lastPushRegistrationErrorMessage = toErrorMessage(error);
    console.warn("Push registration failed.", error);
    resolvePendingPushRegistration("registration-failed");
  });

  await PushNotifications.addListener("pushNotificationReceived", (notification) => {
    pushNotificationReceivedHandler?.(notification);
  });

  listenersAttached = true;
}

export async function ensurePushNotificationRegistration(uid: string): Promise<PushRegistrationStatus> {
  if (!isPushNotificationRuntimeSupported()) {
    return "unsupported";
  }

  const runtimeConfigured = await isNativePushRuntimeConfigured();
  lastPushRegistrationErrorMessage = null;

  activeUid = uid;

  if (!runtimeConfigured) {
    return "runtime-not-configured";
  }

  try {
    await attachPushListeners();

    const permissions = await PushNotifications.checkPermissions();
    const receivePermission =
      permissions.receive === "granted"
        ? permissions.receive
        : (await PushNotifications.requestPermissions()).receive;

    if (receivePermission !== "granted") {
      return "permission-denied";
    }

    const storedToken = readStoredPushToken();
    if (storedToken && storedToken.uid === uid) {
      await savePushToken(uid, storedToken.token);
    }

    const registrationResultPromise = waitForPushRegistrationResult(runtimeConfigured);
    await PushNotifications.register();
    const registrationStatus = await registrationResultPromise;

    if (
      registrationStatus === "registration-failed" &&
      Capacitor.getPlatform() === "ios" &&
      isIosPushRuntimeConfigurationError(lastPushRegistrationErrorMessage)
    ) {
      return "runtime-not-configured";
    }

    return registrationStatus;
  } catch (error) {
    console.warn("Push registration request failed.", error);
    clearPendingPushRegistration();

    if (
      runtimeConfigured &&
      Capacitor.getPlatform() === "ios" &&
      isIosPushRuntimeConfigurationError(toErrorMessage(error))
    ) {
      return "runtime-not-configured";
    }

    return runtimeConfigured ? "registration-failed" : "runtime-not-configured";
  }
}

export async function disableCurrentDevicePushToken(uid: string): Promise<void> {
  if (!isPushNotificationRuntimeSupported() || !db) {
    clearStoredPushToken();
    return;
  }

  const storedToken = readStoredPushToken();
  if (!storedToken || storedToken.uid !== uid) {
    clearStoredPushToken();
    return;
  }

  const tokenRef = doc(getDbClient(), "users", uid, "deviceTokens", tokenToDocumentId(storedToken.token));

  try {
    await runFirestoreWrite(
      () =>
        setDoc(
          tokenRef,
          {
            enabled: false,
            updatedAt: serverTimestamp(),
            disabledAt: serverTimestamp(),
          },
          { merge: true },
        ),
      "Unable to disable push token.",
    );
  } finally {
    clearStoredPushToken();
  }
}

export function setPushNotificationReceivedHandler(
  handler: ((notification: PushNotificationSchema) => void) | null,
): void {
  pushNotificationReceivedHandler = handler;
}

export async function isAndroidTvDevice(): Promise<boolean> {
  if (!isAndroidFirebaseConfigPluginAvailable()) {
    return false;
  }

  try {
    const result = await FirebaseConfig.isTvDevice();
    return result.tv === true;
  } catch (error) {
    console.warn("Unable to detect Android TV environment.", error);
    return false;
  }
}

export async function getRecentPushDeliveryFailure(uid: string): Promise<PushDeliveryFailureDiagnostics | null> {
  if (!isPushNotificationRuntimeSupported() || !db) {
    return null;
  }

  const sentRemindersQuery = query(
    collection(getDbClient(), "users", uid, "sentPushReminders"),
    orderBy("updatedAt", "desc"),
    limit(8),
  );

  const snapshot = await runFirestoreRead(
    () => getDocs(sentRemindersQuery),
    "Unable to load push delivery diagnostics.",
  );

  const cutoffTime = Date.now() - 24 * 60 * 60 * 1000;

  for (const docSnapshot of snapshot.docs) {
    const data = docSnapshot.data();
    if (data.status !== "failed") {
      continue;
    }

    const updatedAt = toDateOrNull(data.updatedAt);
    if (updatedAt && updatedAt.getTime() < cutoffTime) {
      continue;
    }

    return {
      failureCode: typeof data.failureCode === "string" ? data.failureCode : null,
      updatedAt,
    };
  }

  return null;
}

export async function openAppNotificationSettings(): Promise<boolean> {
  if (!isAndroidFirebaseConfigPluginAvailable()) {
    return false;
  }

  try {
    const result = await FirebaseConfig.openAppNotificationSettings();
    return result.opened === true;
  } catch (error) {
    console.warn("Unable to open app notification settings.", error);
    return false;
  }
}

export async function openNotificationChannelSettings(channelId: string): Promise<boolean> {
  if (!isAndroidFirebaseConfigPluginAvailable()) {
    return false;
  }

  try {
    const result = await FirebaseConfig.openNotificationChannelSettings({ channelId });
    return result.opened === true;
  } catch (error) {
    console.warn("Unable to open notification channel settings.", error);
    return false;
  }
}
