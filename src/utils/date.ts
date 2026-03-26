import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isToday,
  parse,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";

import { TimeFormat, WeekStartsOn } from "@/types/user";

const weekStartsOnMap: Record<WeekStartsOn, 0 | 1> = {
  sunday: 0,
  monday: 1,
};

export function toDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function parseDateKey(value: string): Date {
  return parse(value, "yyyy-MM-dd", new Date());
}

export function formatDateLong(value: string): string {
  return format(parseDateKey(value), "EEE, MMM d");
}

export function formatDateDayMonthYear(value: string): string {
  return format(parseDateKey(value), "dd-MMMM-yyyy");
}

export function formatMonthLabel(date: Date): string {
  return format(date, "MMMM yyyy");
}

export function isDateKeyInMonth(value: string, monthDate: Date): boolean {
  const parsedDate = parseDateKey(value);
  return parsedDate.getFullYear() === monthDate.getFullYear() && parsedDate.getMonth() === monthDate.getMonth();
}

export function resolveSelectedDateForMonth(
  monthDate: Date,
  currentSelectedDate: string,
  entryDates: string[],
  weekStartsOn: WeekStartsOn,
  now: Date = new Date(),
): string {
  if (isDateKeyInMonthGrid(currentSelectedDate, monthDate, weekStartsOn)) {
    return currentSelectedDate;
  }

  const firstEntryDate = [...entryDates]
    .filter((entryDate) => isDateKeyInMonth(entryDate, monthDate))
    .sort((left, right) => left.localeCompare(right))[0];
  if (firstEntryDate) {
    return firstEntryDate;
  }

  const todayKey = toDateKey(now);
  if (isDateKeyInMonth(todayKey, monthDate)) {
    return todayKey;
  }

  return toDateKey(startOfMonth(monthDate));
}

export function formatWeekLabel(weekStartDate: Date): string {
  const weekEndDate = addDays(weekStartDate, 6);
  return `${format(weekStartDate, "MMM d")} - ${format(weekEndDate, "MMM d")}`;
}

export function formatWeekday(value: string): string {
  return format(parseDateKey(value), "EEE");
}

export function formatDayNumber(value: string): string {
  return format(parseDateKey(value), "d");
}

export function formatTimeValue(time: string | null, timeFormat: TimeFormat): string {
  if (!time) {
    return "--:--";
  }

  if (timeFormat === "24h") {
    return time;
  }

  const parsed = parse(time, "HH:mm", new Date());
  return format(parsed, "hh:mm a");
}

export function formatTimeRange(
  startTime: string | null,
  endTime: string | null,
  timeFormat: TimeFormat,
): string {
  if (!startTime || !endTime) {
    return "Not set";
  }

  return `${formatTimeValue(startTime, timeFormat)} - ${formatTimeValue(endTime, timeFormat)}`;
}

export function getWeekBounds(anchorDate: Date, weekStartsOn: WeekStartsOn): { start: string; end: string } {
  const start = startOfWeek(anchorDate, { weekStartsOn: weekStartsOnMap[weekStartsOn] });
  const end = endOfWeek(anchorDate, { weekStartsOn: weekStartsOnMap[weekStartsOn] });

  return {
    start: toDateKey(start),
    end: toDateKey(end),
  };
}

export function getMonthBounds(anchorDate: Date): { start: string; end: string } {
  return {
    start: toDateKey(startOfMonth(anchorDate)),
    end: toDateKey(endOfMonth(anchorDate)),
  };
}

export function getMonthGridBounds(anchorDate: Date, weekStartsOn: WeekStartsOn): { start: string; end: string } {
  const gridStart = startOfWeek(startOfMonth(anchorDate), {
    weekStartsOn: weekStartsOnMap[weekStartsOn],
  });
  const gridEnd = addDays(gridStart, 41);

  return {
    start: toDateKey(gridStart),
    end: toDateKey(gridEnd),
  };
}

export function getWeekDays(anchorDate: Date, weekStartsOn: WeekStartsOn): string[] {
  const weekStart = startOfWeek(anchorDate, { weekStartsOn: weekStartsOnMap[weekStartsOn] });

  return Array.from({ length: 7 }, (_, index) => toDateKey(addDays(weekStart, index)));
}

export function shiftWeek(anchorDate: Date, direction: -1 | 1): Date {
  return addWeeks(anchorDate, direction);
}

export function shiftMonth(anchorDate: Date, direction: -1 | 1): Date {
  return addMonths(anchorDate, direction);
}

export function buildMonthGrid(anchorDate: Date, weekStartsOn: WeekStartsOn): Date[] {
  const startDate = startOfWeek(startOfMonth(anchorDate), {
    weekStartsOn: weekStartsOnMap[weekStartsOn],
  });

  return Array.from({ length: 42 }, (_, index) => addDays(startDate, index));
}

export function isDateKeyInMonthGrid(value: string, monthDate: Date, weekStartsOn: WeekStartsOn): boolean {
  const parsedDate = parseDateKey(value);
  const gridBounds = getMonthGridBounds(monthDate, weekStartsOn);
  const gridStart = parseDateKey(gridBounds.start);
  const gridEnd = parseDateKey(gridBounds.end);

  return parsedDate >= gridStart && parsedDate <= gridEnd;
}

export function isDateToday(value: string): boolean {
  return isToday(parseDateKey(value));
}

export function isFutureOrToday(value: string): boolean {
  const date = parseDateKey(value);
  const today = parseDateKey(toDateKey(new Date()));
  return date >= today;
}

export function parseIsoDate(value: string): Date {
  return parseISO(value);
}
