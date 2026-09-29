import { describe, expect, it } from "vitest";
import { computeFreeSlots, isWeekdayGrid, resolveSlots } from "../src/shared/availability";
import { DEFAULT_SETTINGS, type CalEvent, type Settings } from "../src/shared/types";

// Run with TZ=America/New_York (see the "test" script) so local-time assertions are stable.

const SLOT = 15 * 60_000;
const OFF: Settings = {
  ...DEFAULT_SETTINGS,
  hoursWindow: { enabled: false, startHour: 8, endHour: 18 },
  buffer: { enabled: false, minutes: 15 },
  minBlock: { enabled: false, minutes: 30 },
};

/** Slots every 15 min from `from` to `to` (local hours) on 2026-10-05. */
function day(from: number, to: number) {
  const out: number[] = [];
  for (let t = new Date(2026, 9, 5, from).getTime(); t < new Date(2026, 9, 5, to).getTime(); t += SLOT) out.push(t / 1000);
  return resolveSlots(out, false);
}

const at = (h: number, m = 0) => new Date(2026, 9, 5, h, m).getTime();
const hhmm = (sec: number) => {
  const d = new Date(sec * 1000);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
};

function ev(partial: Partial<CalEvent> & { start: number; end: number }): CalEvent {
  return { id: Math.random().toString(36), calendarId: "c", title: "x", allDay: false, declined: false, markedFree: false, ...partial };
}

describe("computeFreeSlots", () => {
  it("marks slots overlapping an event as busy", () => {
    const r = computeFreeSlots(day(9, 12), SLOT, [ev({ start: at(10), end: at(10, 30) })], OFF);
    expect(r.free.map(hhmm)).not.toContain("10:00");
    expect(r.free.map(hhmm)).not.toContain("10:15");
    expect(r.free.map(hhmm)).toContain("9:45");
    expect(r.free.map(hhmm)).toContain("10:30");
  });

  it("blocks any slot partially covered by an event", () => {
    const r = computeFreeSlots(day(9, 11), SLOT, [ev({ start: at(9, 50), end: at(10, 5) })], OFF);
    expect(r.free.map(hhmm)).not.toContain("9:45");
    expect(r.free.map(hhmm)).not.toContain("10:00");
    expect(r.free.map(hhmm)).toContain("10:15");
  });

  it("applies the buffer on both sides", () => {
    const s = { ...OFF, buffer: { enabled: true, minutes: 15 } };
    const r = computeFreeSlots(day(9, 12), SLOT, [ev({ start: at(10), end: at(10, 30) })], s);
    expect(r.free.map(hhmm)).not.toContain("9:45");
    expect(r.free.map(hhmm)).not.toContain("10:30");
    expect(r.free.map(hhmm)).toContain("9:30");
    expect(r.free.map(hhmm)).toContain("10:45");
  });

  it("respects the allowed hours window", () => {
    const s = { ...OFF, hoursWindow: { enabled: true, startHour: 9, endHour: 10 } };
    const r = computeFreeSlots(day(8, 11), SLOT, [], s);
    expect(r.free.map(hhmm)).toEqual(["9:00", "9:15", "9:30", "9:45"]);
  });

  it("drops free gaps shorter than the minimum block", () => {
    const s = { ...OFF, minBlock: { enabled: true, minutes: 30 } };
    const events = [ev({ start: at(9), end: at(9, 30) }), ev({ start: at(9, 45), end: at(10, 30) })];
    const r = computeFreeSlots(day(9, 11), SLOT, events, s);
    expect(r.free.map(hhmm)).toEqual(["10:30", "10:45"]);
  });

  it("ignores and flags all-day, declined, and free events", () => {
    const events = [
      ev({ id: "a", start: at(0), end: at(24), allDay: true, title: "Birthday" }),
      ev({ id: "d", start: at(9), end: at(10), declined: true }),
      ev({ id: "f", start: at(10), end: at(11), markedFree: true }),
    ];
    const r = computeFreeSlots(day(9, 11), SLOT, events, OFF);
    expect(r.free).toHaveLength(8);
    expect(r.ignored.map((e) => [e.id, e.reason])).toEqual([["a", "all-day"], ["d", "declined"], ["f", "marked-free"]]);
  });

  it("counts a flagged event as busy when forced", () => {
    const events = [ev({ id: "d", start: at(9), end: at(10), declined: true })];
    const r = computeFreeSlots(day(9, 11), SLOT, events, OFF, new Set(["d"]));
    expect(r.free.map(hhmm)[0]).toBe("10:00");
    expect(r.ignored).toHaveLength(0);
    expect(r.blocking).toHaveLength(1);
  });

  it("does not flag events outside the poll's time range", () => {
    const r = computeFreeSlots(day(9, 10), SLOT, [ev({ start: at(20), end: at(21), declined: true })], OFF);
    expect(r.ignored).toHaveLength(0);
  });
});

describe("weekday polls", () => {
  // Real when2meet values: Mon Nov 13 1978 09:00 UTC and Wed Nov 15 1978 09:00 UTC.
  const MON_9 = 279795600;
  const WED_9 = 279968400;

  it("detects the fake 1978 week", () => {
    expect(isWeekdayGrid([MON_9])).toBe(true);
    expect(isWeekdayGrid([1791205200])).toBe(false);
  });

  it("maps weekdays to the next occurrence at the same local wall-clock time", () => {
    const tue = new Date(2026, 8, 29, 14); // Tue Sep 29 2026
    const [mon, wed] = resolveSlots([MON_9, WED_9], true, tue);
    expect(new Date(mon.start).toString()).toMatch(/^Mon Oct 05 2026 09:00/);
    expect(new Date(wed.start).toString()).toMatch(/^Wed Sep 30 2026 09:00/);
    expect(mon.w2mTime).toBe(MON_9);
  });

  it("uses today for today's weekday", () => {
    const mon = new Date(2026, 9, 5, 7);
    const [slot] = resolveSlots([MON_9], true, mon);
    expect(new Date(slot.start).toString()).toMatch(/^Mon Oct 05 2026 09:00/);
  });
});
