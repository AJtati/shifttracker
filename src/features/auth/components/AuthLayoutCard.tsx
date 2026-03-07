import { AppLogo } from "@/components/common/AppLogo";

interface AuthLayoutCardProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

export function AuthLayoutCard({ title, subtitle, children }: AuthLayoutCardProps) {
  return (
    <div className="auth-card mx-auto w-full max-w-md rounded-3xl border p-7">
      <AppLogo className="mb-6" />
      <h1 className="auth-card-title text-3xl font-black tracking-tight">{title}</h1>
      <p className="auth-card-subtitle mt-2 text-sm">{subtitle}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}
