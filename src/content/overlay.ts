/**
 * Draws calendar events as labeled blocks over the user's when2meet grid, and sets a
 * hover tooltip on each cell explaining why it's busy or free.
 */
import type { ComputeResult, SlotStatus } from "../shared/availability";
import { IGNORE_REASON_LABEL, type Settings, type Slot } from "../shared/types";

interface Block {
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  ignored: boolean;
}

interface Column {
  cells: { el: HTMLElement; start: number }[]; // sorted by start
}

const layer = document.createElement("div");
layer.className = "w2x-layer";

export function clearOverlay() {
  layer.replaceChildren();
  layer.remove();
  document.querySelectorAll<HTMLElement>("[data-w2x-title]").forEach((el) => {
    el.removeAttribute("title");
    el.removeAttribute("data-w2x-title");
  });
}

export function drawOverlay(slots: Slot[], slotMs: number, result: ComputeResult, settings: Settings) {
  clearOverlay();
  const columns = gridColumns(slots);
  if (!columns.length) return;
  document.body.appendChild(layer);

  const blocks: Block[] = [
    ...result.blocking.map((e) => ({ ...e, ignored: false })),
    ...result.ignored.map((e) => ({ ...e, ignored: true })),
  ];

  for (const col of columns) {
    const colStart = col.cells[0].start;
    const colEnd = col.cells[col.cells.length - 1].start + slotMs;
    const first = col.cells[0].el.getBoundingClientRect();
    const last = col.cells[col.cells.length - 1].el.getBoundingClientRect();
    const x = first.left + scrollX;
    const width = first.width;
    const top = first.top + scrollY;
    const bottom = last.bottom + scrollY;

    // Maps a time to a y position, interpolating within the cell that contains it.
    const yAt = (t: number) => {
      if (t <= colStart) return top;
      if (t >= colEnd) return bottom;
      const cell = col.cells.findLast((c) => c.start <= t)!;
      const r = cell.el.getBoundingClientRect();
      return r.top + scrollY + ((t - cell.start) / slotMs) * r.height;
    };

    const day = new Date(colStart);
    const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();

    // All-day events: stacked strips pinned to the top of the column.
    blocks
      .filter((b) => b.allDay && b.start <= dayStart && b.end > dayStart)
      .forEach((b, i) => place(b, x, top + i * 14, width, 13, "w2x-allday"));

    // Timed events, laid out in side-by-side lanes when they overlap.
    const timed = blocks
      .filter((b) => !b.allDay && b.start < colEnd && b.end > colStart)
      .sort((a, b) => a.start - b.start || b.end - a.end);
    for (const cluster of clusters(timed)) {
      const lanes: number[] = []; // end time of the last block in each lane
      const laneOf = cluster.map((b) => {
        let lane = lanes.findIndex((end) => end <= b.start);
        if (lane === -1) lane = lanes.push(0) - 1;
        lanes[lane] = b.end;
        return lane;
      });
      const w = width / lanes.length;
      cluster.forEach((b, i) => {
        const y1 = yAt(b.start);
        const y2 = Math.max(yAt(b.end), y1 + 6);
        place(b, x + laneOf[i] * w, y1, w, y2 - y1, "");
      });
    }

    for (const c of col.cells) {
      c.el.title = describe(result.status.get(Number(c.el.dataset.time)), settings);
      c.el.dataset.w2xTitle = "1";
    }
  }
}

function place(b: Block, x: number, y: number, w: number, h: number, extra: string) {
  const el = document.createElement("div");
  const narrow = w < 40 ? "w2x-narrow" : "";
  el.className = ["w2x-event", b.ignored ? "w2x-ignored" : "", narrow, extra].filter(Boolean).join(" ");
  Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
  el.textContent = b.title;
  layer.appendChild(el);
}

/** Groups events into runs that transitively overlap, so each run shares a lane count. */
function clusters(sorted: Block[]): Block[][] {
  const out: Block[][] = [];
  let end = -Infinity;
  for (const b of sorted) {
    if (b.start >= end) out.push([]);
    out[out.length - 1].push(b);
    end = Math.max(end, b.end);
  }
  return out;
}

/** Cells of the "You" grid grouped by column, with each cell's real start time. */
function gridColumns(slots: Slot[]): Column[] {
  const realStart = new Map(slots.map((s) => [s.w2mTime, s.start]));
  const byCol = new Map<string, Column>();
  document.querySelectorAll<HTMLElement>('[id^="YouTime"][data-col]').forEach((el) => {
    const start = realStart.get(Number(el.dataset.time));
    if (start === undefined) return;
    const col = el.dataset.col!;
    if (!byCol.has(col)) byCol.set(col, { cells: [] });
    byCol.get(col)!.cells.push({ el, start });
  });
  const cols = [...byCol.values()];
  cols.forEach((c) => c.cells.sort((a, b) => a.start - b.start));
  return cols;
}

function describe(status: SlotStatus | undefined, settings: Settings): string {
  if (!status) return "";
  const titles = (evs: { title: string }[]) => evs.map((e) => `“${e.title}”`).join(", ");
  const lines: string[] = [];
  switch (status.kind) {
    case "free":
      lines.push("Free");
      break;
    case "event":
      lines.push(`Busy: ${titles(status.events)}`);
      break;
    case "buffer":
      lines.push(`Busy: ${settings.buffer.minutes}-min buffer around ${titles(status.events)}`);
      break;
    case "outside-hours":
      lines.push(`Outside your hours (${hour(settings.hoursWindow.startHour)}–${hour(settings.hoursWindow.endHour)})`);
      break;
    case "short-gap":
      lines.push(`Free gap shorter than ${settings.minBlock.minutes} min`);
      break;
  }
  for (const e of status.ignored) lines.push(`Ignoring “${e.title}” (${IGNORE_REASON_LABEL[e.reason]})`);
  return lines.join("\n");
}

function hour(h: number) {
  return new Date(2000, 0, 1, h % 24).toLocaleTimeString(undefined, { hour: "numeric" });
}
