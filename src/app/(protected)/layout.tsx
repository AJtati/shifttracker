"use client";

import { AppShell } from "@/components/layout/AppShell";
import { ProtectedGate } from "@/components/layout/ProtectedGate";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedGate>
      <AppShell>{children}</AppShell>
    </ProtectedGate>
  );
}
