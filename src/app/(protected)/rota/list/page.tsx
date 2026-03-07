"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { EmptyState } from "@/components/common/EmptyState";
import { GradientButton } from "@/components/common/GradientButton";
import { EntryBadge } from "@/components/common/EntryBadge";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { getEntriesForList } from "@/features/entries/services/entryService";
import { toFriendlyFirebaseMessage } from "@/services/firebase/errors";
import { EntryType, RotaEntry } from "@/types/entry";
import { formatDateLong, formatTimeRange, toDateKey } from "@/utils/date";

export default function ListViewPage() {
  const { user, profile } = useAuth();
  const [entries, setEntries] = useState<RotaEntry[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<EntryType | "all">("all");
  const [fromDate, setFromDate] = useState(toDateKey(new Date()));
  const [toDate, setToDate] = useState(`${new Date().getFullYear() + 1}-12-31`);
  const filterControlClassName =
    "h-11 w-full min-w-0 max-w-full rounded-xl border border-white/40 bg-white/20 px-3 py-0 text-sm font-semibold text-white outline-none";

  const loadEntries = useCallback(async () => {
    if (!user) {
      setEntries([]);
      setIsSyncing(false);
      return;
    }

    setIsSyncing(true);
    setError(null);

    try {
      const result = await getEntriesForList(user.uid, {
        type: typeFilter,
        fromDate,
        toDate,
      });
      setEntries(result);
    } catch (loadError) {
      setError(toFriendlyFirebaseMessage(loadError, "Unable to load list view."));
    } finally {
      setIsSyncing(false);
    }
  }, [fromDate, toDate, typeFilter, user]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  return (
    <div className="space-y-5 pb-20 md:pb-0">
      <section className="overflow-hidden rounded-3xl border border-sky-200 bg-gradient-to-r from-blue-600 via-blue-500 to-sky-400 p-5 text-white">
        {isSyncing ? <p className="text-xs font-semibold text-white/85">Syncing...</p> : null}
        <h1 className="text-2xl font-black">List View</h1>
        <p className="mt-1 text-sm font-semibold text-white/90">Chronological rota entries with filters.</p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block min-w-0 space-y-1 text-xs font-semibold uppercase tracking-wide text-white/90">
            Type
            <select
              className={filterControlClassName}
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as EntryType | "all")}
            >
              <option className="text-slate-800" value="all">
                All
              </option>
              <option className="text-slate-800" value="shift">
                Shift
              </option>
              <option className="text-slate-800" value="leave">
                Leave
              </option>
              <option className="text-slate-800" value="holiday">
                Holiday
              </option>
              <option className="text-slate-800" value="off">
                Off
              </option>
            </select>
          </label>

          <label className="block min-w-0 space-y-1 text-xs font-semibold uppercase tracking-wide text-white/90">
            From
            <input
              type="date"
              className={`${filterControlClassName} [appearance:none] [&::-webkit-date-and-time-value]:m-0 [&::-webkit-date-and-time-value]:p-0 [&::-webkit-date-and-time-value]:text-left`}
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </label>

          <label className="block min-w-0 space-y-1 text-xs font-semibold uppercase tracking-wide text-white/90">
            To
            <input
              type="date"
              className={`${filterControlClassName} [appearance:none] [&::-webkit-date-and-time-value]:m-0 [&::-webkit-date-and-time-value]:p-0 [&::-webkit-date-and-time-value]:text-left`}
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </label>
        </div>
      </section>

      {error ? <p className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p> : null}

      {!error ? (
        entries.length === 0 ? (
          <EmptyState
            title="No entries found"
            description="Try expanding the date range or adding your first entry."
            actionLabel="Add entry"
          />
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
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
    </div>
  );
}
