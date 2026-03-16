"use client";

import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { PushNotifications } from "@capacitor/push-notifications";
import { addDays } from "date-fns";
import { CalendarDays, LayoutDashboard, ListChecks, LogOut, UserCircle2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { AppLogo } from "@/components/common/AppLogo";
import { FirebaseConfigBanner } from "@/components/common/FirebaseConfigBanner";
import { useToast } from "@/app/providers/ToastProvider";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { getEntriesByRange, subscribeToEntriesByRange } from "@/features/entries/services/entryService";
import {
  ensurePushNotificationRegistration,
  getRecentPushDeliveryFailure,
  isAndroidTvDevice,
  isPushNotificationRuntimeSupported,
  setPushNotificationReceivedHandler,
} from "@/services/notifications/pushNotificationService";
import {
  clearShiftReminderNotifications,
  isShiftReminderRuntimeSupported,
  syncShiftReminderNotifications,
} from "@/services/notifications/shiftReminderService";
import type { ShiftReminderSyncResult } from "@/services/notifications/shiftReminderService";
import type { RotaEntry } from "@/types/entry";
import { cn } from "@/utils/cn";
import { toDateKey } from "@/utils/date";

const navigationItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/rota/weekly", label: "Weekly", icon: CalendarDays },
  { href: "/rota/monthly", label: "Calendar", icon: CalendarDays },
  { href: "/rota/list", label: "List", icon: ListChecks },
  { href: "/profile", label: "Profile", icon: UserCircle2 },
];
const NOTIFICATION_LOOKAHEAD_DAYS = 120;
const REMINDER_SYNC_DEBOUNCE_MS = 300;
const PUSH_REMINDER_TRANSPORT_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PUSH_REMINDERS !== "false";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, signOutUser, hasFirebaseConfig, authError, firebaseWarning, clearAuthError } = useAuth();
  const { pushToast } = useToast();
  const lastReminderWarningRef = useRef<
    "permission-denied" | "exact-alarm-denied" | "runtime-unsupported" | null
  >(null);
  const reminderEntriesRef = useRef<RotaEntry[] | null>(null);
  const reminderSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPushRegistrationWarningRef = useRef<
    "permission-denied" | "registration-failed" | "runtime-not-configured" | null
  >(null);
  const lastTvPushFailureKeyRef = useRef<string | null>(null);
  const localRemindersClearedForPushRef = useRef(false);
  const [notificationTransport, setNotificationTransport] = useState<"local" | "push">("local");

  const displayName = profile?.fullName ?? user?.displayName ?? user?.email?.split("@")[0] ?? "User";
  const canUsePushReminderTransport =
    PUSH_REMINDER_TRANSPORT_ENABLED && Boolean(user) && isPushNotificationRuntimeSupported();
  const activeNotificationTransport: "local" | "push" = canUsePushReminderTransport
    ? notificationTransport
    : "local";

  useEffect(() => {
    clearAuthError();
  }, [clearAuthError]);

  useEffect(() => {
    const routesToPrefetch = ["/dashboard", "/rota/weekly", "/rota/monthly", "/rota/list", "/profile", "/entry/new"];

    routesToPrefetch.forEach((route) => {
      router.prefetch(route);
    });
  }, [router]);

  const handleReminderSyncResult = useCallback(
    (result: ShiftReminderSyncResult) => {
      if (
        result.status === "scheduled" &&
        result.exactAlarmDenied &&
        lastReminderWarningRef.current !== "exact-alarm-denied"
      ) {
        pushToast(
          "Enable exact alarms for ShiftTracker in Android settings for reliable reminders.",
          "info",
        );
        lastReminderWarningRef.current = "exact-alarm-denied";
        return;
      }

      if (result.status === "scheduled" || result.status === "disabled" || result.status === "unsupported") {
        lastReminderWarningRef.current = null;
        return;
      }

      if (lastReminderWarningRef.current === result.status) {
        return;
      }

      if (result.status === "permission-denied") {
        pushToast("Notifications are blocked on this device. Enable app notifications in Android settings.", "error");
      }

      lastReminderWarningRef.current = result.status;
    },
    [pushToast],
  );

  const syncShiftReminders = useCallback(async (entriesOverride?: RotaEntry[]) => {
    if (!user || !profile) {
      return;
    }

    if (activeNotificationTransport === "push") {
      if (!localRemindersClearedForPushRef.current) {
        try {
          await clearShiftReminderNotifications(user.uid);
        } catch (error) {
          console.warn("Unable to clear local reminders after enabling push transport.", error);
        }
        localRemindersClearedForPushRef.current = true;
      }
      return;
    }

    localRemindersClearedForPushRef.current = false;

    if (!isShiftReminderRuntimeSupported()) {
      if (
        Capacitor.isNativePlatform() &&
        lastReminderWarningRef.current !== "runtime-unsupported"
      ) {
        pushToast(
          "This Android build is missing local notification support. Rebuild and reinstall after running npm run android:sync.",
          "error",
        );
        lastReminderWarningRef.current = "runtime-unsupported";
      }
      return;
    }

    try {
      const reminderPreferences = {
        shiftReminderEnabled: profile.shiftReminderEnabled,
        shiftReminderValue: profile.shiftReminderValue,
        shiftReminderUnit: profile.shiftReminderUnit,
        shiftEndReminderEnabled: profile.shiftEndReminderEnabled,
        shiftEndReminderValue: profile.shiftEndReminderValue,
        shiftEndReminderUnit: profile.shiftEndReminderUnit,
        dayBeforeReminderEnabled: profile.dayBeforeReminderEnabled,
        dayBeforeReminderTime: profile.dayBeforeReminderTime,
        holidayLeaveReminderEnabled: profile.holidayLeaveReminderEnabled,
        holidayLeaveReminderTime: profile.holidayLeaveReminderTime,
        timeFormat: profile.timeFormat,
      };

      const hasReminderEnabled =
        profile.shiftReminderEnabled ||
        profile.shiftEndReminderEnabled ||
        profile.dayBeforeReminderEnabled ||
        profile.holidayLeaveReminderEnabled;

      if (!hasReminderEnabled) {
        const result = await syncShiftReminderNotifications(user.uid, [], reminderPreferences, displayName);
        handleReminderSyncResult(result);
        return;
      }

      const reminderEntries =
        entriesOverride ??
        (await (async () => {
          const startDate = toDateKey(new Date());
          const endDate = toDateKey(addDays(new Date(), NOTIFICATION_LOOKAHEAD_DAYS));
          const upcomingEntries = await getEntriesByRange(user.uid, startDate, endDate);
          return upcomingEntries.filter((entry) => entry.type !== "off");
        })());

      const result = await syncShiftReminderNotifications(user.uid, reminderEntries, reminderPreferences, displayName);
      handleReminderSyncResult(result);
    } catch (error) {
      console.warn("Unable to sync shift reminder notifications.", error);
      const message = error instanceof Error ? error.message : "Unable to sync shift reminders.";
      pushToast(message, "error");
    }
  }, [
    activeNotificationTransport,
    displayName,
    handleReminderSyncResult,
    profile,
    pushToast,
    user,
  ]);

  const queueShiftReminderSync = useCallback(
    (entriesOverride?: RotaEntry[]) => {
      if (entriesOverride) {
        reminderEntriesRef.current = entriesOverride;
      }

      if (reminderSyncTimeoutRef.current) {
        clearTimeout(reminderSyncTimeoutRef.current);
      }

      reminderSyncTimeoutRef.current = setTimeout(() => {
        const nextEntries = reminderEntriesRef.current ?? undefined;
        reminderEntriesRef.current = null;
        void syncShiftReminders(nextEntries);
      }, REMINDER_SYNC_DEBOUNCE_MS);
    },
    [syncShiftReminders],
  );

  const reportTvPushDiagnostics = useCallback(async () => {
    if (!user) {
      return;
    }

    const tvDevice = await isAndroidTvDevice();
    if (!tvDevice) {
      return;
    }

    try {
      const latestFailure = await getRecentPushDeliveryFailure(user.uid);
      if (!latestFailure) {
        return;
      }

      const failureKey = `${latestFailure.failureCode ?? "unknown"}-${latestFailure.updatedAt?.getTime() ?? 0}`;
      if (lastTvPushFailureKeyRef.current === failureKey) {
        return;
      }

      lastTvPushFailureKeyRef.current = failureKey;
      const failureCode = latestFailure.failureCode ?? "unknown-error";
      pushToast(
        `TV push diagnostics: token registered, but a recent reminder delivery failed (${failureCode}).`,
        "info",
      );
      console.warn("TV push diagnostics: recent reminder delivery failed.", {
        uid: user.uid,
        failureCode,
        failedAt: latestFailure.updatedAt?.toISOString() ?? null,
      });
    } catch (error) {
      console.warn("Unable to load TV push delivery diagnostics.", error);
    }
  }, [pushToast, user]);

  useEffect(() => {
    if (!canUsePushReminderTransport || !user) {
      localRemindersClearedForPushRef.current = false;
      return;
    }

    let active = true;

    const registerPushNotifications = async () => {
      const status = await ensurePushNotificationRegistration(user.uid);

      if (!active) {
        return;
      }

      if (status === "permission-denied" && lastPushRegistrationWarningRef.current !== "permission-denied") {
        setNotificationTransport("local");
        localRemindersClearedForPushRef.current = false;
        pushToast(
          "Push notifications are disabled. Enable notifications for ShiftTracker in device settings.",
          "error",
        );
        lastPushRegistrationWarningRef.current = "permission-denied";
        return;
      }

      if (status === "registration-failed" && lastPushRegistrationWarningRef.current !== "registration-failed") {
        setNotificationTransport("local");
        localRemindersClearedForPushRef.current = false;
        pushToast(
          "Push notification registration failed on this build. Add Firebase app config files and rebuild the app.",
          "error",
        );
        lastPushRegistrationWarningRef.current = "registration-failed";
        return;
      }

      if (status === "runtime-not-configured" && lastPushRegistrationWarningRef.current !== "runtime-not-configured") {
        setNotificationTransport("local");
        localRemindersClearedForPushRef.current = false;
        const nativePlatform = Capacitor.getPlatform();
        const message =
          nativePlatform === "android"
            ? "Push notifications are not configured in this Android build. Add google-services.json and rebuild."
            : "Push notifications are unavailable in this iOS signed build. Use an Apple Developer Program team with Push Notifications enabled, then rebuild.";
        pushToast(
          message,
          "info",
        );
        lastPushRegistrationWarningRef.current = "runtime-not-configured";
        return;
      }

      if (status === "registered") {
        setNotificationTransport("push");
        lastPushRegistrationWarningRef.current = null;
        void reportTvPushDiagnostics();
        queueShiftReminderSync();
        return;
      }

      setNotificationTransport("local");
      localRemindersClearedForPushRef.current = false;
    };

    void registerPushNotifications();

    return () => {
      active = false;
    };
  }, [canUsePushReminderTransport, pushToast, queueShiftReminderSync, reportTvPushDiagnostics, user]);

  useEffect(() => {
    setPushNotificationReceivedHandler((notification) => {
      const title = notification.title?.trim();
      const body = notification.body?.trim();

      if (title && body) {
        pushToast(`${title}: ${body}`, "info");
        return;
      }

      if (title) {
        pushToast(title, "info");
      }
    });

    return () => {
      setPushNotificationReceivedHandler(null);
    };
  }, [pushToast]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    let pushActionListener: { remove: () => Promise<void> } | null = null;
    let localActionListener: { remove: () => Promise<void> } | null = null;

    const openDashboardFromNotification = () => {
      router.push("/dashboard");
    };

    const attachNotificationActionListeners = async () => {
      if (isPushNotificationRuntimeSupported()) {
        pushActionListener = await PushNotifications.addListener("pushNotificationActionPerformed", () => {
          openDashboardFromNotification();
        });
      }

      if (isShiftReminderRuntimeSupported()) {
        localActionListener = await LocalNotifications.addListener("localNotificationActionPerformed", () => {
          openDashboardFromNotification();
        });
      }
    };

    void attachNotificationActionListeners();

    return () => {
      if (pushActionListener) {
        void pushActionListener.remove();
      }

      if (localActionListener) {
        void localActionListener.remove();
      }
    };
  }, [router]);

  useEffect(() => {
    return () => {
      if (reminderSyncTimeoutRef.current) {
        clearTimeout(reminderSyncTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    queueShiftReminderSync();
  }, [pathname, queueShiftReminderSync]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        queueShiftReminderSync();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [queueShiftReminderSync]);

  useEffect(() => {
    if (!user || !profile || activeNotificationTransport !== "local" || !isShiftReminderRuntimeSupported()) {
      return;
    }

    const hasReminderEnabled =
      profile.shiftReminderEnabled ||
      profile.shiftEndReminderEnabled ||
      profile.dayBeforeReminderEnabled ||
      profile.holidayLeaveReminderEnabled;

    if (!hasReminderEnabled) {
      queueShiftReminderSync([]);
      return;
    }

    const startDate = toDateKey(new Date());
    const endDate = toDateKey(addDays(new Date(), NOTIFICATION_LOOKAHEAD_DAYS));

    return subscribeToEntriesByRange(
      user.uid,
      startDate,
      endDate,
      {},
      (entries) => {
        const reminderEntries = entries.filter((entry) => entry.type !== "off");
        queueShiftReminderSync(reminderEntries);
      },
      (error) => {
        console.warn("Unable to watch entries for reminder sync.", error);
        const message = error instanceof Error ? error.message : "Unable to watch reminder updates.";
        pushToast(message, "error");
      },
    );
  }, [activeNotificationTransport, profile, pushToast, queueShiftReminderSync, user]);

  const handleSignOut = async () => {
    try {
      await signOutUser();
      router.push("/login");
      pushToast("Logged out successfully.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to log out.";
      pushToast(message, "error");
    }
  };

  return (
    <div className="app-shell-bg">
      <header className="app-shell-header safe-top sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-5 px-4 py-3 sm:px-6">
          <AppLogo href="/dashboard" />

          <nav className="hidden items-center gap-1 md:flex">
            {navigationItems.map((item) => {
              const active = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "app-shell-nav-link rounded-xl px-4 py-2 text-sm font-semibold transition",
                    active && "bg-blue-600 text-white hover:bg-blue-600 hover:text-white",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/profile"
              className="app-shell-chip inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold"
            >
              <UserCircle2 className="h-4 w-4 text-blue-600" />
              <span className="hidden sm:inline">{displayName}</span>
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="app-shell-icon-btn inline-flex h-10 w-10 items-center justify-center rounded-xl border transition hover:border-rose-500/60 hover:bg-rose-950/60 hover:text-rose-300"
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mobile-nav-offset mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6 sm:py-8">
        {!hasFirebaseConfig ? <FirebaseConfigBanner /> : null}
        {firebaseWarning ? (
          <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">{firebaseWarning}</p>
        ) : null}
        {authError ? <p className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">{authError}</p> : null}
        {children}
      </main>

      <nav
        className="app-shell-mobile-nav fixed bottom-0 left-1/2 z-20 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-between rounded-2xl border px-4 pt-2 shadow-lg backdrop-blur md:hidden"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.35rem)" }}
      >
        {navigationItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "app-shell-mobile-link flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-1 text-[11px] font-semibold",
                active && "text-blue-600",
              )}
            >
              <Icon className={cn("h-4 w-4", active && "text-blue-600")} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
