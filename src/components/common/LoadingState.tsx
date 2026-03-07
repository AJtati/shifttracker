export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center rounded-3xl border border-slate-200 bg-white/85">
      <div className="flex items-center gap-3 text-slate-600">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        <span className="text-sm font-semibold">{label}</span>
      </div>
    </div>
  );
}
