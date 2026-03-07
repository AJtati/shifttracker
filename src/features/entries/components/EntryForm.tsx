"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { GradientButton } from "@/components/common/GradientButton";
import { EntryDatePicker } from "@/features/entries/components/EntryDatePicker";
import { RotaEntry, RotaEntryInput } from "@/types/entry";
import { VALID_LEAVE_SUBTYPES } from "@/utils/constants";
import { cn } from "@/utils/cn";
import { validateEntryInput } from "@/utils/validators";

interface EntryFormProps {
  initialValues?: Partial<RotaEntry>;
  initialSelectedDates?: string[];
  isSaving: boolean;
  onSubmit: (values: RotaEntryInput) => Promise<void>;
  onSubmitBulk?: (values: RotaEntryInput[]) => Promise<void>;
  onDelete?: () => Promise<void>;
}

interface EntryFormValues {
  date: string;
  type: "shift" | "leave" | "holiday" | "off";
  title: string;
  startTime: string;
  endTime: string;
  leaveSubtype: "annual" | "sick" | "unpaid" | "personal" | "";
  location: string;
  notes: string;
}

function normalizeDateList(dates: string[]): string[] {
  return Array.from(new Set(dates.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

export function EntryForm({ initialValues, initialSelectedDates, isSaving, onSubmit, onSubmitBulk, onDelete }: EntryFormProps) {
  const defaultValues = useMemo<EntryFormValues>(
    () => ({
      date: initialValues?.date ?? "",
      type: initialValues?.type ?? "shift",
      title: initialValues?.title ?? "",
      startTime: initialValues?.startTime ?? "09:00",
      endTime: initialValues?.endTime ?? "17:00",
      leaveSubtype: initialValues?.leaveSubtype ?? "",
      location: initialValues?.location ?? "",
      notes: initialValues?.notes ?? "",
    }),
    [initialValues],
  );

  const normalizedInitialSelectedDates = useMemo(
    () => normalizeDateList(initialSelectedDates ?? []),
    [initialSelectedDates],
  );

  const isBulkMode = Boolean(onSubmitBulk) && !onDelete;
  const initialMultiSelectEnabled = isBulkMode && normalizedInitialSelectedDates.length > 1;
  const [isMultiSelect, setIsMultiSelect] = useState(initialMultiSelectEnabled);
  const [selectedDates, setSelectedDates] = useState<string[]>(normalizedInitialSelectedDates);

  const {
    register,
    handleSubmit,
    control,
    getValues,
    reset,
    setValue,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<EntryFormValues>({ defaultValues });

  useEffect(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);

  const typeValue = useWatch({
    control,
    name: "type",
  });
  const dateValue = useWatch({
    control,
    name: "date",
  });

  const onValid = async (values: EntryFormValues) => {
    const basePayload: Omit<RotaEntryInput, "date"> = {
      type: values.type,
      title: values.title,
      startTime: values.type === "shift" ? values.startTime : null,
      endTime: values.type === "shift" ? values.endTime : null,
      leaveSubtype: values.type === "leave" && values.leaveSubtype ? values.leaveSubtype : null,
      location: values.location || null,
      notes: values.notes || null,
    };

    const shouldCreateMultiple = isBulkMode && isMultiSelect;
    const targetDates = shouldCreateMultiple ? normalizeDateList(selectedDates) : [values.date];

    if (targetDates.length === 0) {
      setError("date", {
        type: "manual",
        message: "Select at least one date.",
      });
      return;
    }

    const payloads = targetDates.map((date) => ({
      ...basePayload,
      date,
    }));

    for (const payload of payloads) {
      const validation = validateEntryInput(payload);

      if (!validation.isValid) {
        Object.entries(validation.errors).forEach(([field, message]) => {
          if (!message) {
            return;
          }

          setError(field as keyof EntryFormValues, {
            type: "manual",
            message,
          });
        });
        return;
      }
    }

    if (shouldCreateMultiple && onSubmitBulk) {
      await onSubmitBulk(payloads);
      return;
    }

    await onSubmit(payloads[0]);
  };

  const handleDateChange = (nextDate: string) => {
    setValue("date", nextDate, {
      shouldDirty: true,
      shouldValidate: true,
    });
    clearErrors("date");
  };

  const handleSelectedDatesChange = (nextDates: string[]) => {
    setSelectedDates(normalizeDateList(nextDates));
    if (nextDates.length > 0) {
      clearErrors("date");
    }
  };

  const toggleMultiSelect = () => {
    if (!isBulkMode) {
      return;
    }

    setIsMultiSelect((currentState) => {
      const nextState = !currentState;

      if (nextState) {
        setSelectedDates((currentDates) => normalizeDateList(currentDates));
      } else {
        const fallbackDate = selectedDates[0] ?? getValues("date") ?? "";
        setSelectedDates(fallbackDate ? [fallbackDate] : []);
        setValue("date", fallbackDate, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }

      clearErrors("date");
      return nextState;
    });
  };

  return (
    <form onSubmit={handleSubmit(onValid)} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="date" className="text-sm font-semibold text-slate-700">
              Date
            </label>
            {isBulkMode ? (
              <button
                type="button"
                onClick={toggleMultiSelect}
                disabled={isSaving}
                className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                aria-pressed={isMultiSelect}
              >
                <span
                  className={cn(
                    "relative h-5 w-9 rounded-full transition",
                    isMultiSelect ? "bg-blue-600" : "bg-slate-300",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition",
                      isMultiSelect ? "left-4" : "left-0.5",
                    )}
                  />
                </span>
                Multi-select
              </button>
            ) : null}
          </div>
          <input id="date" type="hidden" {...register("date", { required: "Date is required." })} />
          <EntryDatePicker
            value={dateValue ?? ""}
            selectedDates={selectedDates}
            isMultiSelect={isBulkMode && isMultiSelect}
            disabled={isSaving}
            onDateChange={handleDateChange}
            onSelectedDatesChange={handleSelectedDatesChange}
          />
          {errors.date ? <p className="text-xs font-semibold text-rose-600">{errors.date.message}</p> : null}
          {isBulkMode && isMultiSelect ? (
            <div className="space-y-2 pt-1">
              <p className="text-xs font-semibold text-slate-500">Selected: {selectedDates.length}</p>

              <div className="flex flex-wrap gap-2">
                {selectedDates.map((date) => (
                  <span
                    key={date}
                    className="inline-flex items-center rounded-lg bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700"
                  >
                    {date}
                  </span>
                ))}
              </div>

              <p className="text-xs font-semibold text-slate-500">
                Select multiple dates in the calendar popup, then press OK.
              </p>
            </div>
          ) : null}
        </div>

        <div className="space-y-1">
          <label htmlFor="type" className="text-sm font-semibold text-slate-700">
            Type
          </label>
          <select
            id="type"
            className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-500"
            {...register("type")}
          >
            <option value="shift">Shift</option>
            <option value="holiday">Holiday</option>
            <option value="leave">Leave</option>
            <option value="off">Off</option>
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="title" className="text-sm font-semibold text-slate-700">
          Title
        </label>
        <input
          id="title"
          type="text"
          placeholder="Office Shift"
          className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-500"
          {...register("title")}
        />
        {errors.title ? <p className="text-xs font-semibold text-rose-600">{errors.title.message}</p> : null}
      </div>

      {typeValue === "shift" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="startTime" className="text-sm font-semibold text-slate-700">
              Start Time
            </label>
            <input
              id="startTime"
              type="time"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-500"
              {...register("startTime")}
            />
            {errors.startTime ? <p className="text-xs font-semibold text-rose-600">{errors.startTime.message}</p> : null}
          </div>

          <div className="space-y-1">
            <label htmlFor="endTime" className="text-sm font-semibold text-slate-700">
              End Time
            </label>
            <input
              id="endTime"
              type="time"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-500"
              {...register("endTime")}
            />
            {errors.endTime ? <p className="text-xs font-semibold text-rose-600">{errors.endTime.message}</p> : null}
          </div>
        </div>
      ) : null}

      {typeValue === "leave" ? (
        <div className="space-y-1">
          <label htmlFor="leaveSubtype" className="text-sm font-semibold text-slate-700">
            Leave subtype
          </label>
          <select
            id="leaveSubtype"
            className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-500"
            {...register("leaveSubtype")}
          >
            <option value="">Select subtype</option>
            {VALID_LEAVE_SUBTYPES.map((subtype) => (
              <option key={subtype} value={subtype}>
                {subtype.charAt(0).toUpperCase() + subtype.slice(1)}
              </option>
            ))}
          </select>
          {errors.leaveSubtype ? <p className="text-xs font-semibold text-rose-600">{errors.leaveSubtype.message}</p> : null}
        </div>
      ) : null}

      <div className="space-y-1">
        <label htmlFor="location" className="text-sm font-semibold text-slate-700">
          Location (optional)
        </label>
        <input
          id="location"
          type="text"
          placeholder="Office"
          className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-500"
          {...register("location")}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="notes" className="text-sm font-semibold text-slate-700">
          Notes (optional)
        </label>
        <textarea
          id="notes"
          rows={3}
          placeholder="Add details"
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-500"
          {...register("notes")}
        />
        {errors.notes ? <p className="text-xs font-semibold text-rose-600">{errors.notes.message}</p> : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <GradientButton type="submit" disabled={isSaving}>
          {isSaving ? "Saving..." : "Save"}
        </GradientButton>

        {onDelete ? (
          <GradientButton type="button" tone="orange" onClick={() => void onDelete()} disabled={isSaving}>
            Delete
          </GradientButton>
        ) : null}
      </div>
    </form>
  );
}
