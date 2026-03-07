import { PlusCircle } from "lucide-react";
import Link from "next/link";

import { GradientButton } from "@/components/common/GradientButton";

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}

export function EmptyState({ title, description, actionLabel, actionHref = "/entry/new" }: EmptyStateProps) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white/90 px-6 py-10 text-center shadow-sm">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-blue-100 text-blue-600">
        <PlusCircle className="h-7 w-7" />
      </div>
      <h3 className="text-xl font-bold text-slate-800">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      {actionLabel ? (
        <Link href={actionHref} className="mt-5 inline-flex">
          <GradientButton>{actionLabel}</GradientButton>
        </Link>
      ) : null}
    </div>
  );
}
