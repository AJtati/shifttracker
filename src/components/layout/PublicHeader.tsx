"use client";

import Link from "next/link";
import { UserCircle2 } from "lucide-react";

import { AppLogo } from "@/components/common/AppLogo";
import { GradientButton } from "@/components/common/GradientButton";
import { useAuth } from "@/features/auth/hooks/useAuth";

export function PublicHeader() {
  const { user, profile } = useAuth();
  const displayName = profile?.fullName || user?.displayName || "User";

  return (
    <header className="safe-top mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
      <AppLogo />

      {user ? (
        <div className="flex items-center gap-3">
          <p className="public-user-chip hidden items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold sm:inline-flex">
            <UserCircle2 className="h-4 w-4 text-blue-600" />
            {displayName}
          </p>
          <Link href="/dashboard">
            <GradientButton className="h-10 px-5 text-sm">Open app</GradientButton>
          </Link>
        </div>
      ) : (
        <>
          <nav className="hidden items-center gap-4 md:flex">
            <Link href="/login" className="public-login-link text-sm font-semibold transition">
              Login
            </Link>
            <Link href="/signup">
              <GradientButton className="h-10 px-5 text-sm">Sign up</GradientButton>
            </Link>
          </nav>
          <div className="md:hidden">
            <div className="flex items-center gap-3">
              <Link href="/login" className="public-login-link text-sm font-semibold">
                Login
              </Link>
            </div>
          </div>
        </>
      )}
    </header>
  );
}
