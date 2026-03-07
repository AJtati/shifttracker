"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/app/providers/ToastProvider";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { EntryForm } from "@/features/entries/components/EntryForm";
import { deleteEntry, getEntryById, updateEntry } from "@/features/entries/services/entryService";
import { RotaEntry, RotaEntryInput } from "@/types/entry";

export default function EditEntryPage() {
  const searchParams = useSearchParams();
  const entryId = searchParams.get("entryId") ?? "";

  const router = useRouter();
  const { user } = useAuth();
  const { pushToast } = useToast();

  const [entry, setEntry] = useState<RotaEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEntry = useCallback(async () => {
    if (!user || !entryId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await getEntryById(user.uid, entryId);
      setEntry(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load entry.");
    } finally {
      setIsLoading(false);
    }
  }, [entryId, user]);

  useEffect(() => {
    void loadEntry();
  }, [loadEntry]);

  const handleUpdate = async (values: RotaEntryInput) => {
    if (!user || !entryId) {
      return;
    }

    setIsSaving(true);

    try {
      await updateEntry(user.uid, entryId, values);
      pushToast("Entry updated.", "success");
      router.push("/rota/weekly");
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : "Unable to update entry.";
      pushToast(message, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!user || !entryId) {
      return;
    }

    const shouldDelete = window.confirm("Delete this entry?");

    if (!shouldDelete) {
      return;
    }

    setIsSaving(true);

    try {
      await deleteEntry(user.uid, entryId);
      pushToast("Entry deleted.", "success");
      router.push("/rota/weekly");
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Unable to delete entry.";
      pushToast(message, "error");
    } finally {
      setIsSaving(false);
    }
  };

  if (!entryId) {
    return (
      <EmptyState
        title="Missing entry id"
        description="Open this page from a valid entry action."
        actionLabel="Go to weekly rota"
        actionHref="/rota/weekly"
      />
    );
  }

  if (isLoading) {
    return <LoadingState label="Loading entry..." />;
  }

  if (error) {
    return <p className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>;
  }

  if (!entry) {
    return (
      <EmptyState
        title="Entry not found"
        description="This entry may have been deleted already."
        actionLabel="Go to weekly rota"
        actionHref="/rota/weekly"
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 pb-20 md:pb-0">
      <section className="rounded-3xl border border-sky-200 bg-gradient-to-r from-blue-600 to-sky-400 px-6 py-5 text-white">
        <h1 className="text-2xl font-black">Edit Entry</h1>
        <p className="mt-1 text-sm font-semibold text-white/90">Update timing, type, notes, or remove this record.</p>
      </section>

      <EntryForm key={entry.id} initialValues={entry} isSaving={isSaving} onSubmit={handleUpdate} onDelete={handleDelete} />
    </div>
  );
}
