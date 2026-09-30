/**
 * Runs in the when2meet page's own JS world (manifest "world": "MAIN") so it can read
 * when2meet's globals and save availability exactly the way its own drag handler does.
 * Talks to the content script over window.postMessage.
 */
import type { GridInfo } from "../shared/types";
import { isWeekdayGrid } from "../shared/availability";
import { FROM_CS, FROM_PAGE, type CsToPage, type PageToCs } from "../shared/bridge";

declare global {
  // when2meet's globals (top-level `var`s in its inline script)
  var TimeOfSlot: number[] | undefined;
  var AvailableAtSlot: number[][] | undefined;
  var UserID: number | undefined;
  function ReColorIndividual(): void;
  function ReColorGroup(): void;
}

const SLOT_SECONDS = 15 * 60;

function post(msg: PageToCs) {
  window.postMessage({ source: FROM_PAGE, ...msg }, location.origin);
}

function eventIdAndCode(): { id: string; code: string } | null {
  const m = location.search.match(/^\?(\d+)-([A-Za-z0-9]+)/);
  return m ? { id: m[1], code: m[2] } : null;
}

/** Indices into TimeOfSlot that have a cell on the "You" grid. when2meet only saves those. */
function gridIndices(): number[] {
  const out: number[] = [];
  (window.TimeOfSlot ?? []).forEach((t, i) => {
    if (document.getElementById("YouTime" + t)) out.push(i);
  });
  return out;
}

function isAvailable(i: number): boolean {
  return window.AvailableAtSlot![i].includes(window.UserID!);
}

function gridInfo(): GridInfo | null {
  const ev = eventIdAndCode();
  if (!ev || !window.UserID || !window.TimeOfSlot?.length) return null;
  const idx = gridIndices();
  const slots = idx.map((i) => window.TimeOfSlot![i]);
  return {
    eventId: ev.id,
    eventName: document.title.replace(/\s*-\s*When2meet\s*$/i, ""),
    userId: window.UserID,
    weekdayMode: isWeekdayGrid(slots),
    slotSeconds: SLOT_SECONDS,
    slots,
    currentlyAvailable: idx.filter(isAvailable).map((i) => window.TimeOfSlot![i]),
  };
}

/** Mirror of when2meet's SelectStop(): toggle a set of slots and POST SaveTimes.php. */
async function save(indices: number[], makeAvailable: boolean): Promise<void> {
  const ev = eventIdAndCode()!;
  const uid = window.UserID!;
  const avail = window.AvailableAtSlot!;
  const before = indices.map((i) => [...avail[i]]);

  for (const i of indices) {
    const has = avail[i].includes(uid);
    if (makeAvailable && !has) avail[i].push(uid);
    if (!makeAvailable && has) avail[i].splice(avail[i].indexOf(uid), 1);
  }
  const bits = gridIndices().map((i) => (avail[i].includes(uid) ? "1" : "0")).join("");

  const params = new URLSearchParams({
    person: String(uid),
    event: ev.id,
    slots: indices.map((i) => window.TimeOfSlot![i]).join(","),
    availability: bits,
    password: (document.getElementById("password") as HTMLInputElement | null)?.value ?? "",
    ChangeToAvailable: String(makeAvailable),
  });
  try {
    const res = await fetch("SaveTimes.php", { method: "POST", body: params });
    if (!res.ok) throw new Error(`when2meet save failed (HTTP ${res.status})`);
  } catch (e) {
    indices.forEach((i, k) => (avail[i] = before[k]));
    throw e;
  }
}

/** Make the user's grid exactly match `free` (a list of TimeOfSlot values). */
async function applyAvailability(free: number[]): Promise<{ added: number; removed: number }> {
  const want = new Set(free);
  const idx = gridIndices();
  const toAdd = idx.filter((i) => want.has(window.TimeOfSlot![i]) && !isAvailable(i));
  const toRemove = idx.filter((i) => !want.has(window.TimeOfSlot![i]) && isAvailable(i));
  try {
    if (toAdd.length) await save(toAdd, true);
    if (toRemove.length) await save(toRemove, false);
  } finally {
    window.ReColorIndividual?.();
    window.ReColorGroup?.();
  }
  return { added: toAdd.length, removed: toRemove.length };
}

window.addEventListener("message", async (e: MessageEvent) => {
  if (e.source !== window || e.data?.source !== FROM_CS) return;
  const msg = e.data as CsToPage & { reqId: number };
  if (msg.type === "getGrid") {
    post({ type: "grid", reqId: msg.reqId, grid: gridInfo() });
  } else if (msg.type === "apply") {
    try {
      const result = await applyAvailability(msg.free);
      post({ type: "applied", reqId: msg.reqId, ...result });
    } catch (err) {
      post({ type: "applyFailed", reqId: msg.reqId, error: err instanceof Error ? err.message : String(err) });
    }
  }
});

// when2meet has no login event, so watch UserID change from 0 to an id.
let lastUser = 0;
setInterval(() => {
  const uid = window.UserID ?? 0;
  if (uid && uid !== lastUser) {
    lastUser = uid;
    const grid = gridInfo();
    lastAvailability = grid?.currentlyAvailable.join(",") ?? "";
    post({ type: "loggedIn", grid });
  }
}, 300);

// Report manual edits so the preview can update. when2meet saves on mouseup/touchend via
// its own SelectStop handler, so check right after it runs.
let lastAvailability = "";
function reportIfChanged() {
  setTimeout(() => {
    const grid = gridInfo();
    const key = grid?.currentlyAvailable.join(",") ?? "";
    if (grid && key !== lastAvailability) {
      lastAvailability = key;
      post({ type: "gridChanged", grid });
    }
  }, 0);
}
document.addEventListener("mouseup", reportIfChanged);
document.addEventListener("touchend", reportIfChanged);
