export interface Settings {
  /** Calendar IDs that count as busy. null = use the calendars visible in Google Calendar. */
  calendarIds: string[] | null;
  hoursWindow: { enabled: boolean; startHour: number; endHour: number };
  buffer: { enabled: boolean; minutes: number };
  minBlock: { enabled: boolean; minutes: number };
  /** Automatically show the preview banner after signing in on when2meet. */
  promptOnLogin: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  calendarIds: null,
  hoursWindow: { enabled: true, startHour: 8, endHour: 18 },
  buffer: { enabled: true, minutes: 15 },
  minBlock: { enabled: true, minutes: 30 },
  promptOnLogin: true,
};

export type IgnoreReason = "all-day" | "declined" | "marked-free";

export const IGNORE_REASON_LABEL: Record<IgnoreReason, string> = {
  "all-day": "all-day",
  declined: "declined",
  "marked-free": "shown as free",
};

/** A calendar event reduced to what the availability logic needs. */
export interface CalEvent {
  id: string;
  calendarId: string;
  title: string;
  /** Epoch ms. For all-day events, local midnight of the start/end dates. */
  start: number;
  end: number;
  allDay: boolean;
  declined: boolean;
  markedFree: boolean;
}

export interface IgnoredEvent {
  id: string;
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  reason: IgnoreReason;
}

/** One when2meet grid cell, with the real time it represents. */
export interface Slot {
  /** when2meet's own TimeOfSlot value (epoch seconds; fake 1978 dates for weekday polls). */
  w2mTime: number;
  /** Real start time, epoch ms. */
  start: number;
}

export interface GridInfo {
  eventId: string;
  eventName: string;
  userId: number;
  weekdayMode: boolean;
  slotSeconds: number;
  /** All slots on the user's grid, in TimeOfSlot order. */
  slots: number[];
  /** Slots the user is currently marked available for. */
  currentlyAvailable: number[];
}

// ---- messages ----

/** Error message meaning the user hasn't granted calendar access yet; the UI shows a sign-in button. */
export const NEEDS_SIGN_IN = "NEEDS_SIGN_IN";

export type BgRequest =
  | { type: "fetchEvents"; timeMin: number; timeMax: number }
  | { type: "listCalendars"; interactive: boolean }
  | { type: "signIn" }
  | { type: "signOut" }
  | { type: "openOptions" };

export interface CalendarSummary {
  id: string;
  summary: string;
  primary: boolean;
  selected: boolean;
  backgroundColor?: string;
}

export type BgResponse<T> = { ok: true; data: T } | { ok: false; error: string };
