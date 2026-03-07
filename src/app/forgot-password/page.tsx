"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { useToast } from "@/app/providers/ToastProvider";
import { GradientButton } from "@/components/common/GradientButton";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { AuthLayoutCard } from "@/features/auth/components/AuthLayoutCard";

interface ForgotPasswordValues {
  email: string;
}

export default function ForgotPasswordPage() {
  const { sendPasswordReset } = useAuth();
  const { pushToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordValues>();

  const onSubmit = async (values: ForgotPasswordValues) => {
    setIsSubmitting(true);

    try {
      await sendPasswordReset(values.email);
      setIsSent(true);
      pushToast("Password reset email sent.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send reset email.";
      pushToast(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page-bg flex items-center justify-center px-4 py-10">
      <AuthLayoutCard title="Reset password" subtitle="Enter your email and we will send a reset link.">
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

          {isSent ? (
            <p className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
              Check your inbox for password reset instructions.
            </p>
          ) : null}

          <GradientButton type="submit" block disabled={isSubmitting}>
            {isSubmitting ? "Sending..." : "Send reset link"}
          </GradientButton>

          <div className="flex justify-end text-sm">
            <Link href="/login" className="font-semibold text-blue-600 hover:text-blue-700">
              Back to login
            </Link>
          </div>
        </form>
      </AuthLayoutCard>
    </div>
  );
}
