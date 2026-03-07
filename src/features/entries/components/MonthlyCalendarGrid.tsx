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
  shift: "bg-blue-500",
  holiday: "bg-emerald-500",
  leave: "bg-orange-500",
  off: "bg-slate-400",
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
          const isSelected = selectedDate === key;
          const isCurrentMonth = day.getMonth() === monthIndex;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDate(key)}
              className={cn(
                "relative min-h-[74px] rounded-xl border px-2 py-2 text-left transition hover:border-blue-300",
                isSelected ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white",
                !isCurrentMonth && "opacity-45",
              )}
            >
              <span className="text-sm font-bold text-slate-700">{format(day, "d")}</span>
              {entry ? (
                <>
                  <span
                    className={cn(
                      "absolute right-2 top-2 h-2.5 w-2.5 rounded-full",
                      typeDotClassName[entry.type],
                    )}
                  />
                  <p className="mt-3 truncate text-[11px] font-semibold text-slate-700">{entry.title}</p>
                  {entry.type === "shift" ? (
                    <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-500">
                      {formatTimeRange(entry.startTime, entry.endTime, timeFormat)}
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
