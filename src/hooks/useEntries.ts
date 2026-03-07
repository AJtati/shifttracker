"use client";

import { useCallback, useEffect, useState } from "react";

import { getEntriesByRange } from "@/features/entries/services/entryService";
import { EntryType, RotaEntry } from "@/types/entry";

interface UseEntriesParams {
  uid: string | null;
  startDate: string;
  endDate: string;
  type?: EntryType | "all";
}

export function useEntries({ uid, startDate, endDate, type = "all" }: UseEntriesParams) {
  const [entries, setEntries] = useState<RotaEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    if (!uid) {
      setEntries([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const results = await getEntriesByRange(uid, startDate, endDate, { type });
      setEntries(results);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load entries.");
    } finally {
      setIsLoading(false);
    }
  }, [endDate, startDate, type, uid]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  return {
    entries,
    isLoading,
    error,
    refresh: loadEntries,
  };
}
