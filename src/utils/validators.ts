import { RotaEntryInput } from "@/types/entry";
import { VALID_ENTRY_TYPES, VALID_LEAVE_SUBTYPES } from "@/utils/constants";

export interface EntryValidationResult {
  isValid: boolean;
  errors: Partial<Record<keyof RotaEntryInput, string>>;
}

export function validateEntryInput(input: RotaEntryInput): EntryValidationResult {
  const errors: Partial<Record<keyof RotaEntryInput, string>> = {};

  if (!input.date) {
    errors.date = "Date is required.";
  }

  if (!input.type || !VALID_ENTRY_TYPES.includes(input.type)) {
    errors.type = "A valid entry type is required.";
  }

  if (input.type === "shift") {
    if (!input.startTime) {
      errors.startTime = "Start time is required for shifts.";
    }

    if (!input.endTime) {
      errors.endTime = "End time is required for shifts.";
    }

    if (input.startTime && input.endTime && input.startTime >= input.endTime) {
      errors.endTime = "End time must be later than start time.";
    }
  }

  if (input.type === "leave" && input.leaveSubtype && !VALID_LEAVE_SUBTYPES.includes(input.leaveSubtype)) {
    errors.leaveSubtype = "Invalid leave subtype.";
  }

  if (input.title && input.title.length > 100) {
    errors.title = "Title must be less than 100 characters.";
  }

  if (input.notes && input.notes.length > 500) {
    errors.notes = "Notes must be less than 500 characters.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
