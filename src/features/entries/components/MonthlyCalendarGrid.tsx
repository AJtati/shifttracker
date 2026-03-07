import { format } from "date-fns";
import { useMemo } from "react";

import { RotaEntry } from "@/types/entry";
import { TimeFormat, WeekStartsOn } from "@/types/user";
import { buildMonthGrid, formatTimeRange, toDateKey } from "@/utils/date";
import { cn } from "@/utils/cn";

interface MonthlyCalendarGridProps {
  monthDate: Date;
  selectedDate: string;
  entriesByDate: Map<string, RotaEntry>;
  weekStartsOn: WeekStartsOn;
  timeFormat?: TimeFormat;
  showCurrentWeekOnly?: boolean;
  onSelectDate: (date: string) => void;
}

const weekdayLabelsMonday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const weekdayLabelsSunday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const typeDotClassName = {
  shift: "bg-blue-100",
  holiday: "bg-emerald-100",
  leave: "bg-orange-100",
  off: "bg-slate-200",
};

const entryTileClassName = {
  shift: "border-blue-500 bg-gradient-to-br from-blue-600 to-sky-500 text-white hover:border-blue-400",
  holiday: "border-emerald-500 bg-gradient-to-br from-emerald-500 to-lime-500 text-white hover:border-emerald-400",
  leave: "border-orange-500 bg-gradient-to-br from-orange-500 to-rose-500 text-white hover:border-orange-400",
  off: "border-slate-500 bg-gradient-to-br from-slate-500 to-slate-400 text-white hover:border-slate-400",
};

export function MonthlyCalendarGrid({
  monthDate,
  selectedDate,
  entriesByDate,
  weekStartsOn,
  timeFormat = "24h",
  showCurrentWeekOnly = false,
  onSelectDate,
}: MonthlyCalendarGridProps) {
  const days = buildMonthGrid(monthDate, weekStartsOn);
  const monthIndex = monthDate.getMonth();
  const weekdayLabels = weekStartsOn === "monday" ? weekdayLabelsMonday : weekdayLabelsSunday;
  const displayedDays = useMemo(() => {
    if (!showCurrentWeekOnly) {
      return days;
    }

    const selectedIndex = days.findIndex((day) => toDateKey(day) === selectedDate);
    const weekStartIndex = selectedIndex >= 0 ? Math.floor(selectedIndex / 7) * 7 : 0;
    return days.slice(weekStartIndex, weekStartIndex + 7);
  }, [days, selectedDate, showCurrentWeekOnly]);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm">
      <div className="mb-3 grid grid-cols-7 gap-2">
        {weekdayLabels.map((label) => (
          <p key={label} className="text-center text-xs font-black uppercase tracking-wide text-slate-500">
            {label}
          </p>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {displayedDays.map((day) => {
          const key = toDateKey(day);
          const entry = entriesByDate.get(key);
          const entryType = entry?.type ?? null;
          const isSelected = selectedDate === key;
          const isCurrentMonth = day.getMonth() === monthIndex;
          const hasEntry = Boolean(entry);
          const timeRange = entry?.type === "shift" ? formatTimeRange(entry.startTime, entry.endTime, timeFormat) : null;
          const [startTimeLabel, endTimeLabel] = timeRange?.includes(" - ")
            ? (timeRange.split(" - ", 2) as [string, string])
            : [timeRange ?? "", ""];

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDate(key)}
              className={cn(
                "relative min-h-[86px] rounded-xl border px-2 py-2 text-left transition md:min-h-[92px]",
                entryType ? entryTileClassName[entryType] : "border-slate-200 bg-white hover:border-blue-300",
                isSelected && hasEntry && "ring-2 ring-white/80 shadow-[0_0_0_1px_rgba(255,255,255,0.25)]",
                isSelected && !hasEntry && "border-blue-500 bg-blue-50",
                !isCurrentMonth && "opacity-45",
              )}
            >
              <span className={cn("text-sm font-bold", hasEntry ? "text-white" : "text-slate-700")}>
                {format(day, "d")}
              </span>
              {entry ? (
                <>
                  <span
                    className={cn(
                      "absolute right-2 top-2 h-2.5 w-2.5 rounded-full",
                      typeDotClassName[entry.type],
                    )}
                  />
                  <p className="mt-3 truncate text-[11px] font-semibold text-white">{entry.title}</p>
                  {entry.type === "shift" ? (
                    <p className="mt-0.5 whitespace-normal text-[10px] font-semibold leading-tight text-white/90">
                      <span className="block">{startTimeLabel}</span>
                      {endTimeLabel ? <span className="block">{endTimeLabel}</span> : null}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="mt-3 text-[11px] text-slate-400">No entry</p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
