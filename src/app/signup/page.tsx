"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { useToast } from "@/app/providers/ToastProvider";
import { GradientButton } from "@/components/common/GradientButton";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { AuthLayoutCard } from "@/features/auth/components/AuthLayoutCard";

interface SignupFormValues {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export default function SignupPage() {
  const router = useRouter();
  const { pushToast } = useToast();
  const { user, signUpWithEmail, authError } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SignupFormValues>();

  useEffect(() => {
    if (!user) {
      return;
    }

    router.replace("/dashboard");
  }, [router, user]);

  const onSubmit = async (values: SignupFormValues) => {
    setIsSubmitting(true);

    try {
      await signUpWithEmail({
        fullName: values.fullName,
        email: values.email,
        password: values.password,
      });
      pushToast("Account created successfully.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create account.";
      pushToast(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page-bg flex items-center justify-center px-4 py-10">
      <AuthLayoutCard title="Create account" subtitle="Start tracking your rota with private cloud sync.">
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-1">
            <label htmlFor="fullName" className="text-sm font-semibold text-slate-700">
              Full name
            </label>
            <input
              id="fullName"
              type="text"
              autoComplete="name"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none transition focus:border-blue-500"
              {...register("fullName", { required: "Full name is required." })}
            />
            {errors.fullName ? <p className="text-xs font-semibold text-rose-600">{errors.fullName.message}</p> : null}
          </div>

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
              autoComplete="new-password"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none transition focus:border-blue-500"
              {...register("password", {
                required: "Password is required.",
                minLength: { value: 8, message: "Password must be at least 8 characters." },
              })}
            />
            {errors.password ? <p className="text-xs font-semibold text-rose-600">{errors.password.message}</p> : null}
          </div>

          <div className="space-y-1">
            <label htmlFor="confirmPassword" className="text-sm font-semibold text-slate-700">
              Confirm password
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none transition focus:border-blue-500"
              {...register("confirmPassword", {
                required: "Please confirm your password.",
                validate: (value) => value === watch("password") || "Passwords do not match.",
              })}
            />
            {errors.confirmPassword ? <p className="text-xs font-semibold text-rose-600">{errors.confirmPassword.message}</p> : null}
          </div>

          {authError ? <p className="text-sm font-semibold text-rose-600">{authError}</p> : null}

          <GradientButton type="submit" tone="green" block disabled={isSubmitting}>
            {isSubmitting ? "Creating account..." : "Sign up"}
          </GradientButton>

          <div className="flex justify-end text-sm">
            <Link href="/login" className="font-semibold text-blue-600 hover:text-blue-700">
              Already have an account?
            </Link>
          </div>
        </form>
      </AuthLayoutCard>
    </div>
  );
}
