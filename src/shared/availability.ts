import type { CalEvent, IgnoredEvent, IgnoreReason, Settings, Slot } from "./types";

const MIN = 60_000;

/** Weekday-only when2meets encode slots as dates in a fixed week of 1978, read as UTC wall-clock time. */
export function isWeekdayGrid(w2mTimes: number[]): boolean {
  return w2mTimes.length > 0 && new Date(w2mTimes[0] * 1000).getUTCFullYear() < 2000;
}

/**
 * Convert when2meet slot times to real times.
 * Specific-date polls already use real epoch seconds. For weekday polls, each slot's
 * UTC weekday + wall-clock time is mapped to that weekday's next occurrence
 * (today through today+6) at the same wall-clock time in the local timezone.
 */
export function resolveSlots(w2mTimes: number[], weekdayMode: boolean, now: Date = new Date()): Slot[] {
  if (!weekdayMode) return w2mTimes.map((t) => ({ w2mTime: t, start: t * 1000 }));
  const todayDow = now.getDay();
  return w2mTimes.map((t) => {
    const fake = new Date(t * 1000);
    const offset = (fake.getUTCDay() - todayDow + 7) % 7;
    const real = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + offset,
      fake.getUTCHours(),
      fake.getUTCMinutes(),
    );
    return { w2mTime: t, start: real.getTime() };
  });
}

export function ignoreReason(e: CalEvent): IgnoreReason | null {
  if (e.allDay) return "all-day";
  if (e.declined) return "declined";
  if (e.markedFree) return "marked-free";
  return null;
}

export interface ComputeResult {
  /** when2meet slot times (TimeOfSlot values) that should be marked available. */
  free: number[];
  /** Events that were skipped, and why, so the UI can flag them. */
  ignored: IgnoredEvent[];
  /** Events that blocked time. */
  blocking: CalEvent[];
  /** Why each slot ended up busy or free, keyed by when2meet slot time. */
  status: Map<number, SlotStatus>;
}

export type SlotStatus = (
  | { kind: "free" }
  | { kind: "event"; events: CalEvent[] }
  | { kind: "buffer"; events: CalEvent[] }
  | { kind: "outside-hours" }
  | { kind: "short-gap" }
) & {
  /** Ignored events overlapping this slot, so tooltips can mention them. */
  ignored: IgnoredEvent[];
};

/**
 * Decide which slots are free.
 * @param forceBusy IDs of ignored events the user chose to count as busy anyway.
 */
export function computeFreeSlots(
  slots: Slot[],
  slotMs: number,
  events: CalEvent[],
  settings: Settings,
  forceBusy: ReadonlySet<string> = new Set(),
): ComputeResult {
  const ignored: IgnoredEvent[] = [];
  const blocking: CalEvent[] = [];
  const windowStart = slots.length ? Math.min(...slots.map((s) => s.start)) : 0;
  const windowEnd = slots.length ? Math.max(...slots.map((s) => s.start)) + slotMs : 0;

  for (const e of events) {
    if (e.end <= windowStart || e.start >= windowEnd) continue;
    const reason = ignoreReason(e);
    if (reason && !forceBusy.has(e.id)) {
      ignored.push({ id: e.id, title: e.title, start: e.start, end: e.end, allDay: e.allDay, reason });
    } else {
      blocking.push(e);
    }
  }

  const pad = settings.buffer.enabled ? settings.buffer.minutes * MIN : 0;
  const overlaps = (a: number, b: number, start: number, end: number) => a < end && b > start;

  const sorted = [...slots].sort((a, b) => a.start - b.start);
  const statuses: SlotStatus[] = sorted.map((s) => {
    const end = s.start + slotMs;
    const here = ignored.filter((e) => overlaps(e.start, e.end, s.start, end));
    const during = blocking.filter((e) => overlaps(e.start, e.end, s.start, end));
    if (during.length) return { kind: "event", events: during, ignored: here };
    const near = blocking.filter((e) => overlaps(e.start - pad, e.end + pad, s.start, end));
    if (near.length) return { kind: "buffer", events: near, ignored: here };
    if (settings.hoursWindow.enabled && !withinHours(s.start, end, settings.hoursWindow)) {
      return { kind: "outside-hours", ignored: here };
    }
    return { kind: "free", ignored: here };
  });

  // Drop free runs shorter than the minimum block. A run is contiguous in real time.
  if (settings.minBlock.enabled && settings.minBlock.minutes > 0) {
    const minMs = settings.minBlock.minutes * MIN;
    const isFree = (i: number) => statuses[i].kind === "free";
    let i = 0;
    while (i < sorted.length) {
      if (!isFree(i)) { i++; continue; }
      let j = i;
      while (j + 1 < sorted.length && isFree(j + 1) && sorted[j + 1].start === sorted[j].start + slotMs) j++;
      const runMs = sorted[j].start + slotMs - sorted[i].start;
      if (runMs < minMs) for (let k = i; k <= j; k++) statuses[k] = { kind: "short-gap", ignored: statuses[k].ignored };
      i = j + 1;
    }
  }

  const free = sorted.filter((_, i) => statuses[i].kind === "free").map((s) => s.w2mTime);
  const status = new Map(sorted.map((s, i) => [s.w2mTime, statuses[i]]));
  return { free, ignored, blocking, status };
}

function withinHours(start: number, end: number, w: Settings["hoursWindow"]): boolean {
  const s = new Date(start);
  const lo = new Date(s.getFullYear(), s.getMonth(), s.getDate(), w.startHour).getTime();
  // endHour 24 rolls over to midnight at the end of the day.
  const hi = new Date(s.getFullYear(), s.getMonth(), s.getDate(), w.endHour).getTime();
  return start >= lo && end <= hi;
}
