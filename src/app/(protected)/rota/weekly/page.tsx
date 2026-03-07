"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { GradientButton } from "@/components/common/GradientButton";
import { EntryDayRow } from "@/features/entries/components/EntryDayRow";
import { EntryTypeLegend } from "@/features/entries/components/EntryTypeLegend";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { getEntriesByWeek } from "@/features/entries/services/entryService";
import { toFriendlyFirebaseMessage } from "@/services/firebase/errors";
import { RotaEntry } from "@/types/entry";
import { formatWeekLabel, getWeekBounds, getWeekDays, parseDateKey, shiftWeek } from "@/utils/date";

export default function WeeklyRotaPage() {
  const { user, profile } = useAuth();
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [entries, setEntries] = useState<RotaEntry[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weekStartPreference = profile?.weekStartsOn ?? "monday";

  const weekBounds = useMemo(() => getWeekBounds(anchorDate, weekStartPreference), [anchorDate, weekStartPreference]);

  const weekDays = useMemo(() => getWeekDays(anchorDate, weekStartPreference), [anchorDate, weekStartPreference]);

  const weekLabel = useMemo(() => formatWeekLabel(parseDateKey(weekBounds.start)), [weekBounds.start]);

  const loadWeek = useCallback(async () => {
    if (!user) {
      setEntries([]);
      setIsSyncing(false);
      return;
    }

    setIsSyncing(true);
    setError(null);

    try {
      const result = await getEntriesByWeek(user.uid, weekBounds.start, weekBounds.end);
      setEntries(result);
    } catch (loadError) {
      setError(toFriendlyFirebaseMessage(loadError, "Unable to load weekly rota."));
    } finally {
      setIsSyncing(false);
    }
  }, [user, weekBounds.end, weekBounds.start]);

  useEffect(() => {
    void loadWeek();
  }, [loadWeek]);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, RotaEntry>();
    entries.forEach((entry) => {
      map.set(entry.date, entry);
    });
    return map;
  }, [entries]);

  const hasWeekEntries = useMemo(
    () => weekDays.some((date) => entriesByDate.has(date)),
    [entriesByDate, weekDays],
  );

  return (
    <div className="space-y-5 pb-20 md:pb-0">
      <section className="rounded-3xl border border-sky-200 bg-gradient-to-r from-blue-600 via-blue-500 to-sky-400 p-5 text-white">
        {isSyncing ? <p className="text-xs font-semibold text-white/85">Syncing...</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-black">Weekly Rota</h1>
          <Link href="/entry/new">
            <GradientButton className="h-10 px-4 text-sm">
              <Plus className="mr-1 h-4 w-4" />
              Add Entry
            </GradientButton>
          </Link>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAnchorDate((current) => shiftWeek(current, -1))}
            className="grid h-10 w-10 place-items-center rounded-xl bg-white/20 transition hover:bg-white/30"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="rounded-xl bg-white/20 px-4 py-2 text-base font-bold">{weekLabel}</div>
          <button
            type="button"
            onClick={() => setAnchorDate((current) => shiftWeek(current, 1))}
            className="grid h-10 w-10 place-items-center rounded-xl bg-white/20 transition hover:bg-white/30"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setAnchorDate(new Date())}
            className="ml-auto rounded-xl bg-white/20 px-4 py-2 text-sm font-semibold transition hover:bg-white/30"
          >
            Current week
          </button>
        </div>
      </section>

      <EntryTypeLegend />

      {error ? <p className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p> : null}

      {!error ? (
        <div className="space-y-3">
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
    </div>
  );
}
