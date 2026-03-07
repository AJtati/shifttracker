import { EntryBadge } from "@/components/common/EntryBadge";

export function EntryTypeLegend() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <EntryBadge type="shift" />
      <EntryBadge type="holiday" />
      <EntryBadge type="leave" />
      <EntryBadge type="off" />
    </div>
  );
}
