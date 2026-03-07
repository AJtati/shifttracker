import { getApp, getApps, initializeApp } from "firebase/app";
import { browserLocalPersistence, getAuth, indexedDBLocalPersistence, inMemoryPersistence, initializeAuth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  persistentSingleTabManager,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const hasFirebaseConfig = Object.values(firebaseConfig).every((value) => Boolean(value));

function isNativeCapacitorPlatform() {
  if (typeof window === "undefined") {
    return false;
  }

  const maybeCapacitor = (window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;

  return Boolean(maybeCapacitor?.isNativePlatform?.());
}

function getFirebaseApp() {
  if (!hasFirebaseConfig) {
    return null;
  }

  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
}

function getFirestoreClient() {
  if (!firebaseApp) {
    return null;
  }

  // IndexedDB-backed cache improves repeated query latency on slower networks.
  if (typeof window !== "undefined") {
    try {
      // Native app uses a single WebView context; single-tab manager avoids extra coordination overhead.
      const tabManager = isNativeCapacitorPlatform() ? persistentSingleTabManager({}) : persistentMultipleTabManager();

      return initializeFirestore(firebaseApp, {
        localCache: persistentLocalCache({ tabManager }),
      });
    } catch {
      // Firestore may already be initialized or persistent cache may be unavailable.
    }
  }

  return getFirestore(firebaseApp);
}

function getAuthClient() {
  if (!firebaseApp) {
    return null;
  }

  if (typeof window !== "undefined") {
    try {
      const persistence = isNativeCapacitorPlatform()
        ? [browserLocalPersistence, indexedDBLocalPersistence, inMemoryPersistence]
        : [indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence];

      return initializeAuth(firebaseApp, { persistence });
    } catch {
      // Auth may already be initialized.
    }
  }

  return getAuth(firebaseApp);
}

export const firebaseApp = getFirebaseApp();
export const auth = getAuthClient();
export const db = getFirestoreClient();
export const storage = firebaseApp ? getStorage(firebaseApp) : null;
