export type EntryType = "shift" | "leave" | "holiday" | "off";
export type LeaveSubtype = "annual" | "sick" | "unpaid" | "personal";

export interface RotaEntry {
  id: string;
  date: string;
  type: EntryType;
  title: string;
  startTime: string | null;
  endTime: string | null;
  leaveSubtype: LeaveSubtype | null;
  location: string | null;
  notes: string | null;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RotaEntryInput {
  date: string;
  type: EntryType;
  title?: string;
  startTime?: string | null;
  endTime?: string | null;
  leaveSubtype?: LeaveSubtype | null;
  location?: string | null;
  notes?: string | null;
  color?: string | null;
}

export interface RotaEntryFilters {
  type?: EntryType | "all";
  fromDate?: string;
  toDate?: string;
}
