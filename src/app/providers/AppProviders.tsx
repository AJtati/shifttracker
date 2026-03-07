"use client";

import { AuthProvider } from "@/app/providers/AuthProvider";
import { ToastProvider } from "@/app/providers/ToastProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>{children}</AuthProvider>
    </ToastProvider>
  );
}
