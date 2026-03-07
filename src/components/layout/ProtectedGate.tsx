"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { LoadingState } from "@/components/common/LoadingState";
import { useAuth } from "@/features/auth/hooks/useAuth";

export function ProtectedGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, router, user]);

  if (isLoading || !user) {
    return <LoadingState label="Checking your session..." />;
  }

  return <>{children}</>;
}
