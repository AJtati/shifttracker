"use client";

import { CalendarDays, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { GradientButton } from "@/components/common/GradientButton";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { APP_NAME } from "@/utils/constants";

const benefitItems = [
  {
    title: "Weekly clarity",
    description: "See your entire week in one fast view.",
    icon: CalendarDays,
  },
  {
    title: "Secure by design",
    description: "Firebase Authentication and Firestore rules keep data private.",
    icon: ShieldCheck,
  },
  {
    title: "Quick updates",
    description: "Add or edit shifts, leaves, and holidays in seconds.",
    icon: Sparkles,
  },
];

export default function LandingPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && user) {
      router.replace("/dashboard");
    }
  }, [isLoading, router, user]);

  if (isLoading || user) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="landing-page-bg">
      <PublicHeader />

      <main className="mx-auto w-full max-w-7xl px-5 pb-14 pt-6 sm:px-8 lg:pt-10">
        <section className="landing-hero-card mx-auto max-w-5xl rounded-3xl border p-8">
          <p className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-blue-700">
            {APP_NAME}
          </p>
          <h1 className="mt-4 text-4xl font-black leading-tight text-slate-900 sm:text-5xl">
            Track your shifts, holidays and leaves clearly.
          </h1>
          <p className="mt-4 max-w-xl text-base text-slate-600 sm:text-lg">
            One personal rota hub with weekly, monthly, and list views. Know today’s shift instantly and update entries with
            minimal clicks.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            {user ? (
              <Link href="/dashboard">
                <GradientButton className="min-w-40">Open Dashboard</GradientButton>
              </Link>
            ) : (
              <>
                <Link href="/login">
                  <GradientButton className="min-w-32">Login</GradientButton>
                </Link>
                <Link href="/signup">
                  <GradientButton tone="green" className="min-w-32">
                    Sign Up
                  </GradientButton>
                </Link>
              </>
            )}
          </div>

          <div className="mt-9 grid gap-3 sm:grid-cols-3">
            {benefitItems.map((item) => {
              const Icon = item.icon;

              return (
                <article key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <Icon className="h-5 w-5 text-blue-600" />
                  <h2 className="mt-2 text-sm font-black text-slate-800">{item.title}</h2>
                  <p className="mt-1 text-xs text-slate-600">{item.description}</p>
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
