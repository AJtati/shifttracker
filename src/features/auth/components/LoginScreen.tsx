"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { useToast } from "@/app/providers/ToastProvider";
import { GradientButton } from "@/components/common/GradientButton";
import { AuthLayoutCard } from "@/features/auth/components/AuthLayoutCard";
import { useAuth } from "@/features/auth/hooks/useAuth";

interface LoginFormValues {
  email: string;
  password: string;
}

const POST_LOGIN_REDIRECT_STORAGE_KEY = "shifttracker:v1:post-login-redirect";

function normalizeRedirectPath(value: string | null): string | null {
  if (!value) {
    return null;
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  return value;
}

function getStoredRedirectPath(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return normalizeRedirectPath(window.sessionStorage.getItem(POST_LOGIN_REDIRECT_STORAGE_KEY));
}

function saveRedirectPath(path: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(POST_LOGIN_REDIRECT_STORAGE_KEY, path);
}

function clearStoredRedirectPath() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(POST_LOGIN_REDIRECT_STORAGE_KEY);
}

function resolveRedirectPath(search: string): string {
  const params = new URLSearchParams(search);
  const queryRedirectPath = normalizeRedirectPath(params.get("redirect"));
  const storedRedirectPath = getStoredRedirectPath();
  return queryRedirectPath ?? storedRedirectPath ?? "/dashboard";
}

export function LoginScreen() {
  const router = useRouter();
  const { pushToast } = useToast();
  const { user, signInWithEmail, resendVerification, authError } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [redirectPath, setRedirectPath] = useState("/dashboard");

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<LoginFormValues>();

  const navigateAfterLogin = useCallback(
    (targetPath: string) => {
      clearStoredRedirectPath();
      router.replace(targetPath);

      if (typeof window === "undefined") {
        return;
      }

      window.setTimeout(() => {
        if (!window.location.pathname.startsWith("/login")) {
          return;
        }

        window.location.replace(targetPath);
      }, 350);
    },
    [router],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const resolvedPath = resolveRedirectPath(window.location.search);
    saveRedirectPath(resolvedPath);
    setRedirectPath(resolvedPath);
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    navigateAfterLogin(redirectPath);
  }, [navigateAfterLogin, redirectPath, user]);

  const onSubmit = async (values: LoginFormValues) => {
    setIsSubmitting(true);

    try {
      const resolvedPath = typeof window !== "undefined" ? resolveRedirectPath(window.location.search) : redirectPath;
      setRedirectPath(resolvedPath);
      saveRedirectPath(resolvedPath);
      await signInWithEmail(values.email, values.password);
      pushToast("Welcome back.", "success");
      navigateAfterLogin(resolvedPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to sign in.";
      pushToast(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    const email = getValues("email")?.trim();
    const password = getValues("password");

    if (!email || !password) {
      pushToast("Enter your email and password first, then resend verification email.", "error");
      return;
    }

    setIsResendingVerification(true);
    try {
      await resendVerification(email, password);
      pushToast("Verification email sent. Check inbox and spam folder.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to resend verification email.";
      pushToast(message, "error");
    } finally {
      setIsResendingVerification(false);
    }
  };

  const showResendVerification = authError?.toLowerCase().includes("verify your email") ?? false;

  const manualLoginForm = (
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
      {showResendVerification ? (
        <button
          type="button"
          onClick={handleResendVerification}
          disabled={isSubmitting || isResendingVerification}
          className="text-sm font-semibold text-blue-600 transition hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isResendingVerification ? "Resending verification email..." : "Resend verification email"}
        </button>
      ) : null}

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
  );

  return (
    <div className="auth-page-bg flex items-center justify-center px-4 py-10">
      <AuthLayoutCard title="Login" subtitle="Access your rota in seconds.">
        {manualLoginForm}
      </AuthLayoutCard>
    </div>
  );
}
