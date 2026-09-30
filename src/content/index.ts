/**
 * Isolated-world content script: fetches calendar data via the background worker,
 * previews the proposed availability on the when2meet grid, and asks the page-world
 * script to save it once the user confirms.
 */
import { computeFreeSlots, resolveSlots, type ComputeResult } from "../shared/availability";
import { FROM_CS, FROM_PAGE, type CsToPage, type PageToCs } from "../shared/bridge";
import { loadSettings } from "../shared/settings";
import {
  IGNORE_REASON_LABEL,
  NEEDS_SIGN_IN,
  type BgRequest,
  type BgResponse,
  type CalEvent,
  type GridInfo,
  type Settings,
  type IgnoreReason,
  type Slot,
} from "../shared/types";
import { clearOverlay, drawOverlay } from "./overlay";
import { BANNER_CSS, PAGE_CSS } from "./styles";

// ---------- messaging ----------

const STALE_MESSAGE = "when2max was updated or reloaded. Refresh this page to use it.";

/** After the extension reloads, scripts already in open tabs lose their chrome.runtime connection. */
function extensionAlive(): boolean {
  return !!globalThis.chrome?.runtime?.id;
}

async function bg<T>(req: BgRequest): Promise<T> {
  if (!extensionAlive()) throw new Error(STALE_MESSAGE);
  const res: BgResponse<T> = await chrome.runtime.sendMessage(req);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

let nextReqId = 1;
const pending = new Map<number, (msg: PageToCs) => void>();

function page(msg: CsToPage): Promise<PageToCs> {
  const reqId = nextReqId++;
  return new Promise((resolve) => {
    pending.set(reqId, resolve);
    window.postMessage({ source: FROM_CS, reqId, ...msg }, location.origin);
  });
}

window.addEventListener("message", async (e: MessageEvent) => {
  if (e.source !== window || e.data?.source !== FROM_PAGE) return;
  const msg = e.data as PageToCs;
  if ("reqId" in msg) {
    pending.get(msg.reqId)?.(msg);
    pending.delete(msg.reqId);
  } else if (msg.type === "loggedIn" && msg.grid) {
    showLauncher();
    if (!extensionAlive() || (await loadSettings()).promptOnLogin) void startPreview();
  }
});

// ---------- state ----------

interface PreviewState {
  grid: GridInfo;
  slots: Slot[];
  slotMs: number;
  events: CalEvent[];
  forceBusy: Set<string>;
  settings: Settings;
  result: ComputeResult;
}
let state: PreviewState | null = null;
/** Whether calendar events are drawn over the grid. */
let showEvents = true;

// ---------- UI shell ----------

const host = document.createElement("div");
host.id = "when2max-root";
const shadow = host.attachShadow({ mode: "open" });
shadow.innerHTML = `<style>${BANNER_CSS}</style><div class="panel" hidden></div><button class="launcher" hidden title="Autofill from Google Calendar">📅 when2max</button>`;
const panel = shadow.querySelector(".panel") as HTMLDivElement;
const launcher = shadow.querySelector(".launcher") as HTMLButtonElement;
launcher.onclick = () => void startPreview();
document.documentElement.appendChild(host);

const pageStyle = document.createElement("style");
pageStyle.textContent = PAGE_CSS;
document.head.appendChild(pageStyle);

function showLauncher() {
  launcher.hidden = false;
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  ...children: (Node | string | null | false | undefined)[]
): HTMLElementTagNameMap[K] {
  const el = Object.assign(document.createElement(tag), props);
  for (const c of children) if (c) el.append(c);
  return el;
}

function render(...children: (Node | string | null | false | undefined)[]) {
  panel.replaceChildren(
    h("div", { className: "head" },
      h("strong", {}, "when2max"),
      h("button", { className: "icon", title: "Close", onclick: close }, "×"),
    ),
    ...children.filter((c): c is Node | string => !!c),
  );
  panel.hidden = false;
  launcher.hidden = true;
}

function close() {
  clearHighlights();
  clearOverlay();
  panel.hidden = true;
  launcher.hidden = false;
  state = null;
}

function renderError(message: string, retry?: () => void) {
  if (message === STALE_MESSAGE) {
    return render(
      h("p", { className: "error" }, message),
      h("div", { className: "actions" }, h("button", { className: "primary", onclick: () => location.reload() }, "Refresh page")),
    );
  }
  render(
    h("p", { className: "error" }, message),
    h("div", { className: "actions" },
      retry && h("button", { className: "primary", onclick: retry }, "Try again"),
      h("button", { onclick: () => void bg({ type: "openOptions" }) }, "Settings"),
    ),
  );
}

// ---------- preview ----------

async function startPreview() {
  render(h("p", {}, "Reading your Google Calendar…"));
  try {
    const res = await page({ type: "getGrid" });
    const grid = res.type === "grid" ? res.grid : null;
    if (!grid) return renderError("Sign in to this when2meet first.");
    if (!grid.slots.length) return renderError("This when2meet has no time slots on your grid.");

    const slots = resolveSlots(grid.slots, grid.weekdayMode);
    const slotMs = grid.slotSeconds * 1000;
    const starts = slots.map((s) => s.start);
    // Pad the fetch window by a day so buffers and overnight events at the edges are seen.
    const DAY = 86_400_000;
    const events = await bg<CalEvent[]>({
      type: "fetchEvents",
      timeMin: Math.min(...starts) - DAY,
      timeMax: Math.max(...starts) + slotMs + DAY,
    });
    state = { grid, slots, slotMs, events, forceBusy: new Set(), settings: null!, result: null! };
    await recompute();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === NEEDS_SIGN_IN) return renderSignIn();
    renderError(msg, () => void startPreview());
  }
}

function renderSignIn() {
  render(
    h("p", {}, "Connect your Google Calendar to autofill this when2meet."),
    h("div", { className: "actions" },
      h("button", {
        className: "primary",
        onclick: async () => {
          try {
            await bg({ type: "signIn" });
            void startPreview();
          } catch (e) {
            renderError(e instanceof Error ? e.message : String(e), renderSignIn);
          }
        },
      }, "Connect Google Calendar"),
    ),
  );
}

async function recompute() {
  if (!state) return;
  if (!extensionAlive()) return renderError(STALE_MESSAGE);
  state.settings = await loadSettings();
  state.result = computeFreeSlots(state.slots, state.slotMs, state.events, state.settings, state.forceBusy);
  highlight();
  redrawOverlay();
  renderPreview();
}

function diff() {
  const { grid, result } = state!;
  const want = new Set(result.free);
  const have = new Set(grid.currentlyAvailable);
  return {
    add: result.free.filter((t) => !have.has(t)),
    remove: grid.currentlyAvailable.filter((t) => !want.has(t)),
  };
}

function renderPreview() {
  const { grid, slots, slotMs, result, forceBusy } = state!;
  const { add, remove } = diff();
  const hours = (result.free.length * slotMs) / 3_600_000;

  let weekdayNote: HTMLElement | null = null;
  if (grid.weekdayMode) {
    const days = [...new Set(slots.map((s) => new Date(s.start).toDateString()))]
      .map((d) => new Date(d))
      .sort((a, b) => +a - +b)
      .map((d) => d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }));
    weekdayNote = h("p", { className: "note" }, `Weekday poll: using your calendar for ${days.join(", ")}.`);
  }

  // Ignored events, plus any the user has already switched to "busy", so they can switch back.
  const flagged = [
    ...result.ignored.map((e) => ({ ...e, busy: false })),
    ...state!.events
      .filter((e) => forceBusy.has(e.id))
      .map((e) => ({ id: e.id, title: e.title, start: e.start, end: e.end, allDay: e.allDay, reason: reasonOf(e), busy: true })),
  ].sort((a, b) => a.start - b.start);

  const flaggedList = flagged.length
    ? h("details", { className: "flagged", open: true },
        h("summary", {}, `⚠ ${result.ignored.length} event${result.ignored.length === 1 ? "" : "s"} not blocking time`),
        h("ul", {}, ...flagged.map((e) =>
          h("li", {},
            h("label", {},
              h("input", {
                type: "checkbox",
                checked: e.busy,
                onchange: (ev: Event) => {
                  if ((ev.target as HTMLInputElement).checked) forceBusy.add(e.id);
                  else forceBusy.delete(e.id);
                  void recompute();
                },
              }),
              h("span", {},
                h("span", { className: "ev-title" }, e.title),
                h("span", { className: "ev-meta" }, ` · ${IGNORE_REASON_LABEL[e.reason]} · ${fmtRange(e.start, e.end, e.allDay)}`),
              ),
            ),
          ),
        )),
        h("p", { className: "hint" }, "Tick an event to count it as busy."),
      )
    : null;

  const nothingToDo = add.length === 0 && remove.length === 0;
  render(
    h("p", {},
      h("strong", {}, `${fmtHours(hours)} free`),
      ` across ${new Set(slots.filter((s) => result.free.includes(s.w2mTime)).map((s) => new Date(s.start).toDateString())).size} day(s), from ${result.blocking.length} busy event${result.blocking.length === 1 ? "" : "s"}.`,
    ),
    h("p", { className: "legend" },
      h("span", { className: "sw add" }), ` ${add.length} to add  `,
      h("span", { className: "sw remove" }), ` ${remove.length} to remove`,
    ),
    weekdayNote,
    flaggedList,
    eventsToggle(),
    h("div", { className: "actions" },
      h("button", { className: "primary", disabled: nothingToDo, onclick: () => void apply() }, nothingToDo ? "Already up to date" : "Apply to when2meet"),
      h("button", { onclick: close }, "Cancel"),
      h("button", { className: "link", onclick: () => void bg({ type: "openOptions" }) }, "Settings"),
    ),
  );
}

function reasonOf(e: CalEvent): IgnoreReason {
  return e.allDay ? "all-day" : e.declined ? "declined" : "marked-free";
}

async function apply() {
  if (!state) return;
  const previous = state.grid.currentlyAvailable;
  const free = state.result.free;
  render(h("p", {}, "Saving to when2meet…"));
  const res = await page({ type: "apply", free });
  clearHighlights();
  if (res.type !== "applied") return renderError(`Couldn't save: ${res.type === "applyFailed" ? res.error : "unexpected reply"}`, () => void startPreview());
  render(
    h("p", {}, `✓ Saved. ${res.added} slot${res.added === 1 ? "" : "s"} added, ${res.removed} removed.`),
    eventsToggle(),
    h("div", { className: "actions" },
      h("button", { onclick: () => void undo(previous) }, "Undo"),
      h("button", { className: "primary", onclick: close }, "Done"),
    ),
  );
}

async function undo(previous: number[]) {
  render(h("p", {}, "Restoring your previous availability…"));
  const res = await page({ type: "apply", free: previous });
  if (res.type !== "applied") return renderError(`Couldn't undo: ${res.type === "applyFailed" ? res.error : "unexpected reply"}`);
  render(h("p", {}, "Restored your previous availability."), h("div", { className: "actions" }, h("button", { onclick: close }, "Close")));
}

// ---------- event overlay ----------

function eventsToggle() {
  return h("label", { className: "toggle" },
    h("input", {
      type: "checkbox",
      checked: showEvents,
      onchange: (ev: Event) => {
        showEvents = (ev.target as HTMLInputElement).checked;
        redrawOverlay();
      },
    }),
    " Show events on grid (hover a cell for details)",
  );
}

function redrawOverlay() {
  if (state && showEvents) drawOverlay(state.slots, state.slotMs, state.result, state.settings);
  else clearOverlay();
}

// The overlay is absolutely positioned, so re-measure when the layout changes.
let resizeTimer: number | undefined;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => state && showEvents && redrawOverlay(), 100);
});

// ---------- grid highlights ----------

function highlight() {
  clearHighlights();
  const { add, remove } = diff();
  for (const t of add) document.getElementById("YouTime" + t)?.classList.add("w2x-add");
  for (const t of remove) document.getElementById("YouTime" + t)?.classList.add("w2x-remove");
}

function clearHighlights() {
  document.querySelectorAll(".w2x-add, .w2x-remove").forEach((el) => el.classList.remove("w2x-add", "w2x-remove"));
}

// ---------- formatting ----------

function fmtHours(h: number) {
  return `${Number.isInteger(h) ? h : h.toFixed(2).replace(/0$/, "")} hr`;
}

function fmtRange(start: number, end: number, allDay: boolean) {
  const d = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const t = (x: number) => new Date(x).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (allDay) {
    const last = end - 86_400_000; // all-day end dates are exclusive
    return last > start ? `${d(start)} – ${d(last)}` : d(start);
  }
  return `${d(start)} ${t(start)}–${t(end)}`;
}
