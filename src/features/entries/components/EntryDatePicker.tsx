"use client";

import { format } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { buildMonthGrid, formatMonthLabel, parseDateKey, shiftMonth, toDateKey } from "@/utils/date";
import { cn } from "@/utils/cn";

interface EntryDatePickerProps {
  value: string;
  selectedDates: string[];
  isMultiSelect: boolean;
  disabled?: boolean;
  onDateChange: (date: string) => void;
  onSelectedDatesChange: (dates: string[]) => void;
}

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function normalizeDateList(dates: string[]): string[] {
  return Array.from(new Set(dates.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function toSafeDate(value: string | null | undefined): Date {
  if (!value) {
    return new Date();
  }

  const parsed = parseDateKey(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function formatDateForField(value: string): string {
  const date = toSafeDate(value);
  return format(date, "dd/MM/yyyy");
}

export function EntryDatePicker({
  value,
  selectedDates,
  isMultiSelect,
  disabled = false,
  onDateChange,
  onSelectedDatesChange,
}: EntryDatePickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [monthDate, setMonthDate] = useState<Date>(() => toSafeDate(value));
  const [draftSelectedDates, setDraftSelectedDates] = useState<string[]>([]);

  const displayValue = useMemo(() => {
    if (isMultiSelect) {
      if (selectedDates.length === 0) {
        return "Select multiple dates";
      }

      if (selectedDates.length === 1) {
        return formatDateForField(selectedDates[0]);
      }

      return `${selectedDates.length} dates selected`;
    }

    return value ? formatDateForField(value) : "Select date";
  }, [isMultiSelect, selectedDates, value]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current) {
        return;
      }

      if (!containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const openPicker = () => {
    if (disabled) {
      return;
    }

    const normalizedExisting = normalizeDateList(
      isMultiSelect ? selectedDates : [value || toDateKey(new Date())],
    );
    const anchorDate = normalizedExisting[0] ?? value ?? toDateKey(new Date());

    setDraftSelectedDates(normalizedExisting);
    setMonthDate(toSafeDate(anchorDate));
    setIsOpen(true);
  };

  const handleDayClick = (dateKey: string) => {
    setDraftSelectedDates((currentDates) => {
      if (isMultiSelect) {
        return currentDates.includes(dateKey)
          ? currentDates.filter((date) => date !== dateKey)
          : normalizeDateList([...currentDates, dateKey]);
      }

      return [dateKey];
    });
  };

  const handleClearDraft = () => {
    setDraftSelectedDates([]);
  };

  const handleConfirm = () => {
    const normalizedSelection = normalizeDateList(draftSelectedDates);

    if (isMultiSelect) {
      onSelectedDatesChange(normalizedSelection);
      onDateChange(normalizedSelection[0] ?? "");
    } else {
      const nextDate = normalizedSelection[0] ?? value ?? "";
      onDateChange(nextDate);
      onSelectedDatesChange(nextDate ? [nextDate] : []);
    }

    setIsOpen(false);
  };

  const days = useMemo(() => buildMonthGrid(monthDate, "monday"), [monthDate]);
  const monthIndex = monthDate.getMonth();
  const todayKey = toDateKey(new Date());

  const calendarPanel = (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-black text-slate-900">{formatMonthLabel(monthDate)}</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMonthDate((current) => shiftMonth(current, -1))}
            className="rounded-md border border-slate-200 p-1.5 text-slate-600 transition hover:bg-slate-100"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setMonthDate((current) => shiftMonth(current, 1))}
            className="rounded-md border border-slate-200 p-1.5 text-slate-600 transition hover:bg-slate-100"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mb-2 grid grid-cols-7 gap-1">
        {weekdayLabels.map((label) => (
          <p key={label} className="text-center text-[11px] font-black uppercase tracking-wide text-slate-500">
            {label}
          </p>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((date) => {
          const dateKey = toDateKey(date);
          const isSelected = draftSelectedDates.includes(dateKey);
          const isCurrentMonth = date.getMonth() === monthIndex;
          const isToday = dateKey === todayKey;

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => handleDayClick(dateKey)}
              className={cn(
                "h-9 rounded-lg border text-xs font-bold transition",
                isSelected
                  ? "border-blue-500 bg-blue-600 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50",
                !isCurrentMonth && "opacity-45",
                isToday && !isSelected && "border-blue-300",
              )}
            >
              {format(date, "d")}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <p className="text-xs font-semibold text-slate-500">
          {isMultiSelect ? `Selected: ${draftSelectedDates.length}` : "Select a date and press OK"}
        </p>
        <div className="flex items-center gap-2">
          {isMultiSelect ? (
            <button
              type="button"
              onClick={handleClearDraft}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100"
            >
              Clear
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={draftSelectedDates.length === 0}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 px-3 text-left text-sm font-medium text-slate-700 outline-none transition hover:border-blue-300 focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
        aria-label={isMultiSelect ? "Open multi-date picker" : "Open date picker"}
      >
        <span>{displayValue}</span>
        <CalendarDays className="h-4 w-4 text-slate-500" />
      </button>

      {isOpen ? (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/35 sm:hidden" onClick={() => setIsOpen(false)} />
          <div className="fixed inset-x-3 bottom-3 z-50 sm:hidden">{calendarPanel}</div>
          <div className="absolute left-0 top-[calc(100%+8px)] z-50 hidden w-[336px] sm:block">{calendarPanel}</div>
        </>
      ) : null}
    </div>
  );
}
