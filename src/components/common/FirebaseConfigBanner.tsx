import { AlertTriangle } from "lucide-react";

export function FirebaseConfigBanner() {
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4" />
        Firebase environment variables are missing.
      </p>
      <p className="mt-1 text-xs text-amber-900/90">
        Add NEXT_PUBLIC_FIREBASE_* values in `.env.local` to enable authentication and data persistence.
      </p>
    </div>
  );
}
