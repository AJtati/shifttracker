import { Timestamp } from "firebase/firestore";

export function toIsoTimestamp(value: unknown, fallback = new Date().toISOString()): string {
  if (!value) {
    return fallback;
  }

  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return value;
  }

  return fallback;
}
