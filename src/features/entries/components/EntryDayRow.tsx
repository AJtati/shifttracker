import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { EntryBadge } from "@/components/common/EntryBadge";
import { RotaEntry } from "@/types/entry";
import { TimeFormat } from "@/types/user";
import { formatDayNumber, formatTimeRange, formatWeekday, isDateToday } from "@/utils/date";
import { cn } from "@/utils/cn";

interface EntryDayRowProps {
  date: string;
  entry?: RotaEntry;
  timeFormat: TimeFormat;
  layout?: "row" | "card";
}

export function EntryDayRow({ date, entry, timeFormat, layout = "row" }: EntryDayRowProps) {
  const href = entry ? `/entry/edit?entryId=${entry.id}` : `/entry/new?date=${date}`;
  const today = isDateToday(date);

  if (layout === "card") {
    return (
      <Link
        href={href}
        className={cn(
          "group flex h-full min-h-44 flex-col rounded-2xl border bg-white p-4 transition hover:shadow-sm",
          today ? "border-blue-300 shadow-sm" : "border-slate-200 hover:border-blue-200",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{formatWeekday(date)}</p>
            <p className="text-2xl font-black leading-none text-slate-900">{formatDayNumber(date)}</p>
          </div>
          {today ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-700">Today</span> : null}
        </div>

        {entry ? (
          <div className="mt-4 space-y-2">
            <EntryBadge type={entry.type} compact />
            <p className="line-clamp-2 text-sm font-bold text-slate-800">{entry.title}</p>
            <p className="text-xs font-semibold text-slate-600">{formatTimeRange(entry.startTime, entry.endTime, timeFormat)}</p>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <EntryBadge type="off" compact />
            <p className="text-xs font-semibold text-slate-500">No entry</p>
          </div>
        )}

        <div className="mt-auto flex justify-end pt-3">
          <ChevronRight className="h-4 w-4 text-slate-400 transition group-hover:text-blue-600" />
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="group grid grid-cols-[auto,1fr,auto] items-center gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 transition hover:border-blue-200 hover:shadow-sm"
    >
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{formatWeekday(date)}</p>
        <p className="text-xl font-black text-slate-800">{formatDayNumber(date)}</p>
      </div>

      {entry ? (
        <div className="space-y-1">
          <EntryBadge type={entry.type} compact />
          <p className="text-base font-bold text-slate-800">{entry.title}</p>
          <p className="text-sm font-semibold text-slate-600">{formatTimeRange(entry.startTime, entry.endTime, timeFormat)}</p>
        </div>
      ) : (
        <div>
          <EntryBadge type="off" compact />
          <p className="mt-1 text-sm font-semibold text-slate-500">No entry. Tap to add one.</p>
        </div>
      )}

      <ChevronRight className="h-5 w-5 text-slate-400 transition group-hover:text-blue-600" />
    </Link>
  );
}
