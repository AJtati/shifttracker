"use client";

import { addDays, addMonths } from "date-fns";
import { CalendarPlus, ChevronLeft, ChevronRight, ClipboardPlus, Plane } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useToast } from "@/app/providers/ToastProvider";
import { EntryBadge } from "@/components/common/EntryBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { GradientButton } from "@/components/common/GradientButton";
import { EntryDayRow } from "@/features/entries/components/EntryDayRow";
import { EntryTypeLegend } from "@/features/entries/components/EntryTypeLegend";
import { MonthlyCalendarGrid } from "@/features/entries/components/MonthlyCalendarGrid";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { usePreferences } from "@/hooks/usePreferences";
import { toFriendlyFirebaseMessage } from "@/services/firebase/errors";
import {
  getEntriesByMonth,
  getEntriesByRange,
  getEntriesByWeek,
  getNextShift,
  getTodayEntry,
} from "@/features/entries/services/entryService";
import { RotaEntry } from "@/types/entry";
import { UserPreferences } from "@/types/user";
import { DEFAULT_PREFERENCES } from "@/utils/constants";
import {
  formatDateDayMonthYear,
  formatDateLong,
  formatMonthLabel,
  formatTimeRange,
  formatWeekLabel,
  getMonthBounds,
  getWeekBounds,
  getWeekDays,
  parseDateKey,
  shiftWeek,
  toDateKey,
} from "@/utils/date";

type DashboardScheduleView = "weekly" | "monthly" | "list";

function toMonthInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

function isSameMonth(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { pushToast } = useToast();
  const { savePreferences, isSaving: isSavingPreferences } = usePreferences();
  const [todayEntry, setTodayEntry] = useState<RotaEntry | null>(null);
  const [nextShiftEntry, setNextShiftEntry] = useState<RotaEntry | null>(null);
  const [weekEntries, setWeekEntries] = useState<RotaEntry[]>([]);
  const [monthEntries, setMonthEntries] = useState<RotaEntry[]>([]);
  const [listEntries, setListEntries] = useState<RotaEntry[]>([]);
  const [weekAnchorDate, setWeekAnchorDate] = useState<Date>(() => new Date());
  const [monthAnchorDate, setMonthAnchorDate] = useState<Date>(() => new Date());
  const [selectedMonthDate, setSelectedMonthDate] = useState(toDateKey(new Date()));
  const [scheduleViewOverride, setScheduleViewOverride] = useState<DashboardScheduleView | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isScheduleSyncing, setIsScheduleSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const today = useMemo(() => toDateKey(new Date()), []);
  const weekBounds = useMemo(
    () => getWeekBounds(weekAnchorDate, profile?.weekStartsOn ?? "monday"),
    [profile?.weekStartsOn, weekAnchorDate],
  );
  const weekLabel = useMemo(() => formatWeekLabel(parseDateKey(weekBounds.start)), [weekBounds.start]);
  const monthBounds = useMemo(() => getMonthBounds(monthAnchorDate), [monthAnchorDate]);
  const listRange = useMemo(
    () => ({
      start: today,
      end: toDateKey(addDays(new Date(), 90)),
    }),
    [today],
  );

  const weekDays = useMemo(
    () => getWeekDays(weekAnchorDate, profile?.weekStartsOn ?? "monday"),
    [profile?.weekStartsOn, weekAnchorDate],
  );
  const preferredScheduleView = useMemo<DashboardScheduleView>(() => {
    if (profile?.defaultView === "monthly" || profile?.defaultView === "list" || profile?.defaultView === "weekly") {
      return profile.defaultView;
    }

    return "weekly";
  }, [profile?.defaultView]);
  const scheduleView = scheduleViewOverride ?? preferredScheduleView;

  const resolvedPreferences = useMemo<UserPreferences>(
    () => ({
      defaultView: profile?.defaultView ?? DEFAULT_PREFERENCES.defaultView,
      weekStartsOn: profile?.weekStartsOn ?? DEFAULT_PREFERENCES.weekStartsOn,
      timeFormat: profile?.timeFormat ?? DEFAULT_PREFERENCES.timeFormat,
      theme: profile?.theme ?? DEFAULT_PREFERENCES.theme,
      timezone: profile?.timezone ?? DEFAULT_PREFERENCES.timezone,
      shiftReminderEnabled: profile?.shiftReminderEnabled ?? DEFAULT_PREFERENCES.shiftReminderEnabled,
      shiftReminderValue: profile?.shiftReminderValue ?? DEFAULT_PREFERENCES.shiftReminderValue,
      shiftReminderUnit: profile?.shiftReminderUnit ?? DEFAULT_PREFERENCES.shiftReminderUnit,
      shiftEndReminderEnabled: profile?.shiftEndReminderEnabled ?? DEFAULT_PREFERENCES.shiftEndReminderEnabled,
      shiftEndReminderValue: profile?.shiftEndReminderValue ?? DEFAULT_PREFERENCES.shiftEndReminderValue,
      shiftEndReminderUnit: profile?.shiftEndReminderUnit ?? DEFAULT_PREFERENCES.shiftEndReminderUnit,
      dayBeforeReminderEnabled: profile?.dayBeforeReminderEnabled ?? DEFAULT_PREFERENCES.dayBeforeReminderEnabled,
      dayBeforeReminderTime: profile?.dayBeforeReminderTime ?? DEFAULT_PREFERENCES.dayBeforeReminderTime,
      holidayLeaveReminderEnabled:
        profile?.holidayLeaveReminderEnabled ?? DEFAULT_PREFERENCES.holidayLeaveReminderEnabled,
      holidayLeaveReminderTime: profile?.holidayLeaveReminderTime ?? DEFAULT_PREFERENCES.holidayLeaveReminderTime,
    }),
    [
      profile?.dayBeforeReminderEnabled,
      profile?.dayBeforeReminderTime,
      profile?.defaultView,
      profile?.holidayLeaveReminderEnabled,
      profile?.holidayLeaveReminderTime,
      profile?.shiftEndReminderEnabled,
      profile?.shiftEndReminderUnit,
      profile?.shiftEndReminderValue,
      profile?.shiftReminderEnabled,
      profile?.shiftReminderUnit,
      profile?.shiftReminderValue,
      profile?.theme,
      profile?.timeFormat,
      profile?.timezone,
      profile?.weekStartsOn,
    ],
  );

  useEffect(() => {
    if (!user) {
      setTodayEntry(null);
      setNextShiftEntry(null);
      setWeekEntries([]);
      setIsSyncing(false);
      return;
    }

    const loadDashboard = async () => {
      setIsSyncing(true);
      setError(null);

      try {
        const dashboardErrors: string[] = [];

        const nextShiftState = await Promise.allSettled([getNextShift(user.uid, today)]);

        const resolvedNextShift = nextShiftState[0].status === "fulfilled" ? nextShiftState[0].value : null;

        if (nextShiftState[0].status === "rejected") {
          dashboardErrors.push(toFriendlyFirebaseMessage(nextShiftState[0].reason, "Unable to load next shift."));
        }

        let resolvedTodayEntry: RotaEntry | null = null;

        try {
          resolvedTodayEntry = await getTodayEntry(user.uid, today);
        } catch (todayError) {
          dashboardErrors.push(toFriendlyFirebaseMessage(todayError, "Unable to load today's entry."));
        }

        setTodayEntry(resolvedTodayEntry);
        setNextShiftEntry(resolvedNextShift);

        if (dashboardErrors.length > 0 && !resolvedTodayEntry && !resolvedNextShift) {
          setError(dashboardErrors[0]);
        }
      } catch (loadError) {
        setError(toFriendlyFirebaseMessage(loadError, "Unable to load dashboard data."));
      } finally {
        setIsSyncing(false);
      }
    };

    void loadDashboard();
  }, [profile?.weekStartsOn, today, user]);

  useEffect(() => {
    router.prefetch("/entry/new");
    router.prefetch("/rota/weekly");
    router.prefetch("/rota/monthly");
    router.prefetch("/rota/list");
  }, [router]);

  useEffect(() => {
    if (!user) {
      setWeekEntries([]);
      setMonthEntries([]);
      setListEntries([]);
      setIsScheduleSyncing(false);
      return;
    }

    const loadSchedulePreview = async () => {
      setIsScheduleSyncing(true);
      setScheduleError(null);

      try {
        if (scheduleView === "weekly") {
          const result = await getEntriesByWeek(user.uid, weekBounds.start, weekBounds.end);
          setWeekEntries(result);
          return;
        }

        if (scheduleView === "monthly") {
          const result = await getEntriesByMonth(user.uid, monthBounds.start, monthBounds.end);
          setMonthEntries(result);
          return;
        }

        const result = await getEntriesByRange(user.uid, listRange.start, listRange.end);
        setListEntries(result.sort((a, b) => a.date.localeCompare(b.date)));
      } catch (loadError) {
        setScheduleError(
          toFriendlyFirebaseMessage(
            loadError,
            scheduleView === "weekly"
              ? "Unable to load weekly preview."
              : scheduleView === "monthly"
                ? "Unable to load monthly preview."
                : "Unable to load list preview.",
          ),
        );
      } finally {
        setIsScheduleSyncing(false);
      }
    };

    void loadSchedulePreview();
  }, [
    listRange.end,
    listRange.start,
    monthBounds.end,
    monthBounds.start,
    scheduleView,
    user,
    weekBounds.end,
    weekBounds.start,
  ]);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, RotaEntry>();
    weekEntries.forEach((entry) => {
      map.set(entry.date, entry);
    });
    return map;
  }, [weekEntries]);

  const monthEntriesByDate = useMemo(() => {
    const map = new Map<string, RotaEntry>();
    monthEntries.forEach((entry) => {
      map.set(entry.date, entry);
    });
    return map;
  }, [monthEntries]);

  const selectedMonthEntry = monthEntriesByDate.get(selectedMonthDate);
  const hasWeekEntries = useMemo(() => weekDays.some((date) => entriesByDate.has(date)), [entriesByDate, weekDays]);
  const monthInputValue = useMemo(() => toMonthInputValue(monthAnchorDate), [monthAnchorDate]);
  const viewingCurrentMonth = useMemo(() => isSameMonth(monthAnchorDate, new Date()), [monthAnchorDate]);
  const viewingCurrentWeek = useMemo(() => {
    const currentWeekStart = getWeekBounds(new Date(), profile?.weekStartsOn ?? "monday").start;
    return weekBounds.start === currentWeekStart;
  }, [profile?.weekStartsOn, weekBounds.start]);

  useEffect(() => {
    const now = new Date();
    const defaultDate = isSameMonth(monthAnchorDate, now)
      ? now
      : new Date(monthAnchorDate.getFullYear(), monthAnchorDate.getMonth(), 1);
    setSelectedMonthDate(toDateKey(defaultDate));
  }, [monthAnchorDate]);

  const handleScheduleViewChange = async (nextView: DashboardScheduleView) => {
    if (!user) {
      return;
    }

    if (nextView === scheduleView) {
      return;
    }

    setScheduleViewOverride(nextView);
    setScheduleError(null);

    try {
      await savePreferences({
        ...resolvedPreferences,
        defaultView: nextView,
      });
      pushToast(`Default view set to ${nextView}.`, "success");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Unable to update default view.";
      setScheduleViewOverride(null);
      pushToast(message, "error");
    }
  };

  const handlePreviousMonth = () => {
    setMonthAnchorDate((currentMonth) => addMonths(currentMonth, -1));
  };

  const handleNextMonth = () => {
    setMonthAnchorDate((currentMonth) => addMonths(currentMonth, 1));
  };

  const handleJumpToCurrentMonth = () => {
    setMonthAnchorDate(new Date());
  };

  const handleMonthPickerChange = (value: string) => {
    const [yearText, monthText] = value.split("-");
    const year = Number(yearText);
    const month = Number(monthText);

    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return;
    }

    setMonthAnchorDate(new Date(year, month - 1, 1));
  };

  const handlePreviousWeek = () => {
    setWeekAnchorDate((currentWeek) => shiftWeek(currentWeek, -1));
  };

  const handleNextWeek = () => {
    setWeekAnchorDate((currentWeek) => shiftWeek(currentWeek, 1));
  };

  const handleJumpToCurrentWeek = () => {
    setWeekAnchorDate(new Date());
  };

  return (
    <div className="space-y-5 pb-20 md:pb-0">
      {error ? <p className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p> : null}
      <section className="rounded-3xl border border-sky-200 bg-gradient-to-r from-blue-600 via-blue-500 to-sky-400 p-5 text-white shadow-lg sm:p-6">
        {isSyncing ? <p className="text-xs font-semibold text-white/85">Syncing...</p> : null}
        <p className="text-2xl font-black">Good Morning, {profile?.fullName ?? "there"}!</p>
        <p className="mt-1 text-sm font-semibold text-white/90">{formatDateLong(today)}</p>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          <article className="rounded-2xl bg-white/12 p-4 backdrop-blur">
            <p className="text-sm font-bold">Today&apos;s Shift</p>
            {todayEntry ? (
              <>
                <p className="mt-2 text-3xl font-black">{formatTimeRange(todayEntry.startTime, todayEntry.endTime, profile?.timeFormat ?? "24h")}</p>
                <p className="text-sm font-semibold">{todayEntry.title}</p>
              </>
            ) : (
              <p className="mt-2 text-lg font-bold">No shift added yet</p>
            )}
          </article>

          <article className="rounded-2xl bg-gradient-to-r from-emerald-500/90 to-lime-400/90 p-4 text-white">
            <p className="text-sm font-bold">Next Shift</p>
            {nextShiftEntry ? (
              <>
                <p className="mt-2 text-2xl font-black">{formatDateDayMonthYear(nextShiftEntry.date)}</p>
                <p className="text-base font-semibold">
                  {formatTimeRange(nextShiftEntry.startTime, nextShiftEntry.endTime, profile?.timeFormat ?? "24h")}
                </p>
              </>
            ) : (
              <p className="mt-2 text-lg font-bold">No upcoming shift</p>
            )}
          </article>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/entry/new?type=shift">
            <GradientButton className="h-10 px-4 text-sm">
              <CalendarPlus className="mr-2 h-4 w-4" />
              Add Shift
            </GradientButton>
          </Link>
          <Link href="/entry/new?type=leave">
            <GradientButton tone="orange" className="h-10 px-4 text-sm">
              <Plane className="mr-2 h-4 w-4" />
              Add Leave
            </GradientButton>
          </Link>
          <Link href="/entry/new?type=holiday">
            <GradientButton tone="green" className="h-10 px-4 text-sm">
              <ClipboardPlus className="mr-2 h-4 w-4" />
              Add Holiday
            </GradientButton>
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-black text-slate-900">Schedule View</h2>
          <div className="flex flex-wrap items-center gap-2">
            {isSavingPreferences ? <span className="text-xs font-semibold text-slate-500">Saving default...</span> : null}
            {isScheduleSyncing ? <span className="text-xs font-semibold text-slate-500">Syncing...</span> : null}
            <select
              className="h-10 min-w-40 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-500"
              value={scheduleView}
              onChange={(event) => {
                void handleScheduleViewChange(event.target.value as DashboardScheduleView);
              }}
              disabled={isSavingPreferences}
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly Calendar</option>
              <option value="list">List</option>
            </select>
          </div>
        </div>

        {scheduleError ? <p className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{scheduleError}</p> : null}

        {scheduleView === "weekly" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <button
                type="button"
                onClick={handlePreviousWeek}
                className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
                aria-label="Previous week"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700">
                {weekLabel}
              </div>

              <button
                type="button"
                onClick={handleNextWeek}
                className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
                aria-label="Next week"
              >
                <ChevronRight className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={handleJumpToCurrentWeek}
                disabled={viewingCurrentWeek}
                className="ml-auto h-9 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Current week
              </button>
            </div>

            <EntryTypeLegend />

            {!hasWeekEntries ? (
              <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600">
                No entries this week yet. Tap a day card to add one.
              </p>
            ) : null}

            <div className="overflow-x-auto pb-1">
              <div className="grid min-w-[980px] grid-cols-7 gap-3">
                {weekDays.map((date) => (
                  <EntryDayRow
                    key={date}
                    date={date}
                    entry={entriesByDate.get(date)}
                    timeFormat={profile?.timeFormat ?? "24h"}
                    layout="card"
                  />
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {scheduleView === "monthly" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <button
                type="button"
                onClick={handlePreviousMonth}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <input
                type="month"
                value={monthInputValue}
                onChange={(event) => {
                  handleMonthPickerChange(event.target.value);
                }}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-500"
                aria-label="Choose month"
              />

              <button
                type="button"
                onClick={handleNextMonth}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={handleJumpToCurrentMonth}
                disabled={viewingCurrentMonth}
                className="ml-auto h-9 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                This month
              </button>

              <span className="w-full text-xs font-semibold uppercase tracking-wide text-slate-500 sm:ml-2 sm:w-auto">
                Viewing: {formatMonthLabel(monthAnchorDate)}
              </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
              <MonthlyCalendarGrid
                monthDate={monthAnchorDate}
                selectedDate={selectedMonthDate}
                entriesByDate={monthEntriesByDate}
                weekStartsOn={profile?.weekStartsOn ?? "monday"}
                timeFormat={profile?.timeFormat ?? "24h"}
                onSelectDate={setSelectedMonthDate}
              />

              <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{formatMonthLabel(monthAnchorDate)}</p>
                <h3 className="mt-1 text-lg font-black text-slate-900">{formatDateLong(selectedMonthDate)}</h3>

                {selectedMonthEntry ? (
                  <div className="mt-4 space-y-3">
                    <EntryBadge type={selectedMonthEntry.type} />
                    <p className="text-lg font-black text-slate-900">{selectedMonthEntry.title}</p>
                    <p className="text-sm font-semibold text-slate-600">
                      {formatTimeRange(selectedMonthEntry.startTime, selectedMonthEntry.endTime, profile?.timeFormat ?? "24h")}
                    </p>
                    <Link href={`/entry/edit?entryId=${selectedMonthEntry.id}`}>
                      <GradientButton block>Edit Entry</GradientButton>
                    </Link>
                  </div>
                ) : (
                  <div className="mt-4">
                    <EmptyState
                      title="No entry for this date"
                      description="Select another date or add a new entry."
                      actionLabel="Add entry"
                      actionHref={`/entry/new?date=${selectedMonthDate}`}
                    />
                  </div>
                )}
              </aside>
            </div>
          </div>
        ) : null}

        {scheduleView === "list" ? (
          listEntries.length === 0 ? (
            <EmptyState
              title="No upcoming entries"
              description="Your next 90 days are currently empty."
              actionLabel="Add entry"
            />
          ) : (
            <div className="space-y-2">
              {listEntries.slice(0, 8).map((entry) => (
                <article
                  key={entry.id}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-blue-200"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{formatDateLong(entry.date)}</p>
                      <p className="text-lg font-black text-slate-900">{entry.title}</p>
                      <p className="text-sm font-semibold text-slate-600">
                        {formatTimeRange(entry.startTime, entry.endTime, profile?.timeFormat ?? "24h")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <EntryBadge type={entry.type} />
                      <Link href={`/entry/edit?entryId=${entry.id}`}>
                        <GradientButton className="h-10 px-4 text-sm">Edit</GradientButton>
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )
        ) : null}
      </section>
    </div>
  );
}
