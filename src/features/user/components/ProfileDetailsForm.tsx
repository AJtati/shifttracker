"use client";

import { useEffect, useState } from "react";

import { GradientButton } from "@/components/common/GradientButton";

interface ProfileDetailsFormProps {
  fullName: string;
  email: string;
  isSaving: boolean;
  onSave: (fullName: string) => Promise<void>;
}

export function ProfileDetailsForm({ fullName, email, isSaving, onSave }: ProfileDetailsFormProps) {
  const [nameInput, setNameInput] = useState(fullName);

  useEffect(() => {
    setNameInput(fullName);
  }, [fullName]);

  return (
    <form
      className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(nameInput);
      }}
    >
      <h2 className="text-xl font-black text-slate-900">Personal details</h2>

      <label className="space-y-1 text-sm font-semibold text-slate-700">
        Full name
        <input
          type="text"
          value={nameInput}
          onChange={(event) => setNameInput(event.target.value)}
          className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-500"
          required
        />
      </label>

      <label className="space-y-1 text-sm font-semibold text-slate-700">
        Email
        <input
          type="email"
          value={email}
          disabled
          className="h-11 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 text-sm font-semibold text-slate-500"
        />
      </label>

      <GradientButton type="submit" disabled={isSaving} className="mt-2">
        {isSaving ? "Saving..." : "Save profile"}
      </GradientButton>
    </form>
  );
}
