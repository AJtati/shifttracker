import { Circle } from "lucide-react";

import { EntryType } from "@/types/entry";
import { ENTRY_TYPE_LABEL } from "@/utils/constants";
import { cn } from "@/utils/cn";

interface EntryBadgeProps {
  type: EntryType;
  compact?: boolean;
}

const dotClassName: Record<EntryType, string> = {
  shift: "text-blue-500",
  holiday: "text-emerald-500",
  leave: "text-orange-500",
  off: "text-slate-500",
};

export function EntryBadge({ type, compact = false }: EntryBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700",
        compact && "px-2",
      )}
    >
      <Circle className={cn("h-3 w-3 fill-current", dotClassName[type])} />
      {ENTRY_TYPE_LABEL[type]}
    </span>
  );
}
