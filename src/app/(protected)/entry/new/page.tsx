"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { useToast } from "@/app/providers/ToastProvider";
import { EntryForm } from "@/features/entries/components/EntryForm";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { createEntries } from "@/features/entries/services/entryService";
import { EntryType, RotaEntryInput } from "@/types/entry";
import { toDateKey } from "@/utils/date";

const entryTypes: EntryType[] = ["shift", "leave", "holiday", "off"];

export default function AddEntryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { pushToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const { initialValues, initialSelectedDates, formKey } = useMemo(() => {
    const dateParam = searchParams.get("date");
    const typeParam = searchParams.get("type") as EntryType | null;
    const resolvedType = typeParam && entryTypes.includes(typeParam) ? typeParam : "shift";

    return {
      initialValues: {
        date: dateParam ?? toDateKey(new Date()),
        type: resolvedType,
      },
      initialSelectedDates: dateParam ? [dateParam] : [],
      formKey: `${dateParam ?? "today"}|${resolvedType}`,
    };
  }, [searchParams]);

  const handleCreateBulk = async (values: RotaEntryInput[]) => {
    if (!user) {
      pushToast("You must be logged in.", "error");
      return;
    }

    setIsSaving(true);

    try {
      await createEntries(user.uid, values);

      if (values.length > 1) {
        pushToast(`${values.length} entries saved successfully.`, "success");
      } else {
        pushToast("Entry saved successfully.", "success");
      }

      router.push("/rota/weekly");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save entry.";
      pushToast(message, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreate = async (value: RotaEntryInput) => {
    await handleCreateBulk([value]);
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 pb-20 md:pb-0">
      <section className="rounded-3xl border border-sky-200 bg-gradient-to-r from-blue-600 to-sky-400 px-6 py-5 text-white">
        <h1 className="text-2xl font-black">Add Entry</h1>
        <p className="mt-1 text-sm font-semibold text-white/90">Create a shift, leave, holiday, or off-day record.</p>
      </section>

      <EntryForm
        key={formKey}
        initialValues={initialValues}
        initialSelectedDates={initialSelectedDates}
        isSaving={isSaving}
        onSubmit={handleCreate}
        onSubmitBulk={handleCreateBulk}
      />
    </div>
  );
}
