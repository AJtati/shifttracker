"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { useToast } from "@/app/providers/ToastProvider";
import { GradientButton } from "@/components/common/GradientButton";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { AuthLayoutCard } from "@/features/auth/components/AuthLayoutCard";

interface LoginFormValues {
  email: string;
  password: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { pushToast } = useToast();
  const { user, signInWithEmail, authError } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>();

  useEffect(() => {
    if (!user) {
      return;
    }

    router.replace("/dashboard");
  }, [router, user]);

  const onSubmit = async (values: LoginFormValues) => {
    setIsSubmitting(true);

    try {
      await signInWithEmail(values.email, values.password);
      pushToast("Welcome back.", "success");
      router.replace("/dashboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to sign in.";
      pushToast(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page-bg flex items-center justify-center px-4 py-10">
      <AuthLayoutCard title="Login" subtitle="Access your rota in seconds.">
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-semibold text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none transition focus:border-blue-500"
              {...register("email", { required: "Email is required." })}
            />
            {errors.email ? <p className="text-xs font-semibold text-rose-600">{errors.email.message}</p> : null}
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="text-sm font-semibold text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none transition focus:border-blue-500"
              {...register("password", { required: "Password is required." })}
            />
            {errors.password ? <p className="text-xs font-semibold text-rose-600">{errors.password.message}</p> : null}
          </div>

          {authError ? <p className="text-sm font-semibold text-rose-600">{authError}</p> : null}

          <GradientButton type="submit" block disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Login"}
          </GradientButton>

          <div className="flex items-center justify-between text-sm">
            <Link href="/forgot-password" className="font-semibold text-blue-600 hover:text-blue-700">
              Forgot password?
            </Link>
            <Link href="/signup" className="font-semibold text-slate-600 hover:text-blue-700">
              Sign up
            </Link>
          </div>
        </form>
      </AuthLayoutCard>
    </div>
  );
}
