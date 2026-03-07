import { ButtonHTMLAttributes } from "react";

import { cn } from "@/utils/cn";

interface GradientButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: "blue" | "green" | "orange" | "slate";
  block?: boolean;
}

const toneClassName = {
  blue: "bg-gradient-to-r from-blue-600 via-sky-500 to-blue-500 text-white",
  green: "bg-gradient-to-r from-emerald-600 via-green-500 to-lime-400 text-white",
  orange: "bg-gradient-to-r from-orange-500 via-rose-500 to-orange-400 text-white",
  slate: "bg-gradient-to-r from-slate-500 via-slate-600 to-slate-500 text-white",
};

export function GradientButton({ tone = "blue", block = false, className, children, ...props }: GradientButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex h-12 items-center justify-center rounded-xl px-6 text-base font-bold transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70",
        toneClassName[tone],
        block && "w-full",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
