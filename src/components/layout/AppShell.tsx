"use client";

import { CalendarDays, LayoutDashboard, ListChecks, LogOut, UserCircle2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { AppLogo } from "@/components/common/AppLogo";
import { FirebaseConfigBanner } from "@/components/common/FirebaseConfigBanner";
import { useToast } from "@/app/providers/ToastProvider";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { cn } from "@/utils/cn";

const navigationItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/rota/weekly", label: "Weekly", icon: CalendarDays },
  { href: "/rota/monthly", label: "Calendar", icon: CalendarDays },
  { href: "/rota/list", label: "List", icon: ListChecks },
  { href: "/profile", label: "Profile", icon: UserCircle2 },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, signOutUser, hasFirebaseConfig, authError, firebaseWarning, clearAuthError } = useAuth();
  const { pushToast } = useToast();

  const displayName = profile?.fullName ?? user?.displayName ?? user?.email?.split("@")[0] ?? "User";

  useEffect(() => {
    clearAuthError();
  }, [clearAuthError]);

  useEffect(() => {
    const routesToPrefetch = ["/dashboard", "/rota/weekly", "/rota/monthly", "/rota/list", "/profile", "/entry/new"];

    routesToPrefetch.forEach((route) => {
      router.prefetch(route);
    });
  }, [router]);

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
