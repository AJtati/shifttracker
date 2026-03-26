"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/common/EmptyState";
import { GradientButton } from "@/components/common/GradientButton";
import { EntryBadge } from "@/components/common/EntryBadge";
import { MonthlyCalendarGrid } from "@/features/entries/components/MonthlyCalendarGrid";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { getEntriesByMonth } from "@/features/entries/services/entryService";
import { toFriendlyFirebaseMessage } from "@/services/firebase/errors";
import { RotaEntry } from "@/types/entry";
import {
  formatDateLong,
  formatMonthLabel,
  formatTimeRange,
  getMonthGridBounds,
  resolveSelectedDateForMonth,
  shiftMonth,
  toDateKey,
} from "@/utils/date";
import { cn } from "@/utils/cn";

export default function MonthlyCalendarPage() {
  const { user, profile } = useAuth();
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(toDateKey(new Date()));
  const [showCurrentWeekOnly, setShowCurrentWeekOnly] = useState(false);
  const [entries, setEntries] = useState<RotaEntry[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weekStartsOn = profile?.weekStartsOn ?? "monday";
  const monthBounds = useMemo(() => getMonthGridBounds(anchorDate, weekStartsOn), [anchorDate, weekStartsOn]);

  const loadMonth = useCallback(async () => {
    if (!user) {
      setEntries([]);
      setIsSyncing(false);
      return;
    }

    setIsSyncing(true);
    setError(null);

    try {
      const result = await getEntriesByMonth(user.uid, monthBounds.start, monthBounds.end);
      setEntries(result);
    } catch (loadError) {
      setError(toFriendlyFirebaseMessage(loadError, "Unable to load calendar."));
    } finally {
      setIsSyncing(false);
    }
  }, [monthBounds.end, monthBounds.start, user]);

  useEffect(() => {
    void loadMonth();
  }, [loadMonth]);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, RotaEntry>();
    entries.forEach((entry) => {
      map.set(entry.date, entry);
    });
    return map;
  }, [entries]);

  useEffect(() => {
    const resolvedDate = resolveSelectedDateForMonth(
      anchorDate,
      selectedDate,
      entries.map((entry) => entry.date),
      weekStartsOn,
    );

    if (resolvedDate !== selectedDate) {
      setSelectedDate(resolvedDate);
    }
  }, [anchorDate, entries, selectedDate, weekStartsOn]);

  const selectedEntry = entriesByDate.get(selectedDate);

  return (
    <div className="space-y-5 pb-20 md:pb-0">
      <section className="rounded-3xl border border-sky-200 bg-gradient-to-r from-blue-600 via-blue-500 to-sky-400 p-5 text-white">
        {isSyncing ? <p className="text-xs font-semibold text-white/85">Syncing...</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-black">Monthly Schedule</h1>
          <Link href={`/entry/new?date=${selectedDate}`}>
            <GradientButton className="h-10 px-4 text-sm">
              <Plus className="mr-1 h-4 w-4" />
              Add Entry
            </GradientButton>
          </Link>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setAnchorDate((current) => shiftMonth(current, -1));
              setShowCurrentWeekOnly(false);
            }}
            className="grid h-10 w-10 place-items-center rounded-xl bg-white/20 transition hover:bg-white/30"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <p className="rounded-xl bg-white/20 px-4 py-2 text-base font-bold">{formatMonthLabel(anchorDate)}</p>

          <button
            type="button"
            onClick={() => {
              setAnchorDate((current) => shiftMonth(current, 1));
              setShowCurrentWeekOnly(false);
            }}
            className="grid h-10 w-10 place-items-center rounded-xl bg-white/20 transition hover:bg-white/30"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => {
              setAnchorDate(new Date());
              setSelectedDate(toDateKey(new Date()));
              setShowCurrentWeekOnly(true);
            }}
            className={cn(
              "ml-auto rounded-xl px-4 py-2 text-sm font-semibold transition",
              showCurrentWeekOnly ? "bg-white/35 text-white" : "bg-white/20 hover:bg-white/30",
            )}
          >
            This week
          </button>

          <button
            type="button"
            onClick={() => {
              setAnchorDate(new Date());
              setSelectedDate(toDateKey(new Date()));
              setShowCurrentWeekOnly(false);
            }}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-semibold transition",
              !showCurrentWeekOnly ? "bg-white/35 text-white" : "bg-white/20 hover:bg-white/30",
            )}
          >
            This month
          </button>
        </div>
      </section>

      {error ? <p className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p> : null}

      {!error ? (
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <MonthlyCalendarGrid
            monthDate={anchorDate}
            selectedDate={selectedDate}
            entriesByDate={entriesByDate}
            weekStartsOn={weekStartsOn}
            timeFormat={profile?.timeFormat ?? "24h"}
            showCurrentWeekOnly={showCurrentWeekOnly}
            onSelectDate={setSelectedDate}
          />

          <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold uppercase tracking-wide text-slate-500">Selected date</p>
            <h2 className="mt-1 text-xl font-black text-slate-900">{formatDateLong(selectedDate)}</h2>

            {selectedEntry ? (
              <div className="mt-4 space-y-3">
                <EntryBadge type={selectedEntry.type} />
                <p className="text-lg font-black text-slate-800">{selectedEntry.title}</p>
                <p className="text-sm font-semibold text-slate-600">
                  {formatTimeRange(selectedEntry.startTime, selectedEntry.endTime, profile?.timeFormat ?? "24h")}
                </p>
                {selectedEntry.notes ? <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">{selectedEntry.notes}</p> : null}

                <Link href={`/entry/edit?entryId=${selectedEntry.id}`}>
                  <GradientButton block>Edit Entry</GradientButton>
                </Link>
              </div>
            ) : (
              <div className="mt-4">
                <EmptyState
                  title="No entry for this date"
                  description="Create a shift, leave, holiday, or off day record."
                  actionLabel="Add entry"
                  actionHref={`/entry/new?date=${selectedDate}`}
                />
              </div>
            )}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
