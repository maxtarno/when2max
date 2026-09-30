import { loadSettings, saveSettings } from "../shared/settings";
import { NEEDS_SIGN_IN, type BgRequest, type BgResponse, type CalendarSummary, type Settings, type UpdateInfo } from "../shared/types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function bg<T>(req: BgRequest): Promise<T> {
  const res: BgResponse<T> = await chrome.runtime.sendMessage(req);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

let settings: Settings;
let calendars: CalendarSummary[] = [];

function hourLabel(h: number) {
  return new Date(2000, 0, 1, h % 24).toLocaleTimeString(undefined, { hour: "numeric" }) + (h === 24 ? " (midnight)" : "");
}

function fillHours(select: HTMLSelectElement, from: number, to: number) {
  for (let h = from; h <= to; h++) select.add(new Option(hourLabel(h), String(h)));
}

let savedTimer: number | undefined;
async function persist() {
  await saveSettings(settings);
  $("saved").textContent = "Saved";
  clearTimeout(savedTimer);
  savedTimer = window.setTimeout(() => ($("saved").textContent = ""), 1500);
}

function bindConstraints() {
  const hs = $<HTMLSelectElement>("hours-start");
  const he = $<HTMLSelectElement>("hours-end");
  fillHours(hs, 0, 23);
  fillHours(he, 1, 24);

  const s = settings;
  checkbox("hours-enabled", s.hoursWindow.enabled, (v) => (s.hoursWindow.enabled = v));
  value("hours-start", s.hoursWindow.startHour, (v) => (s.hoursWindow.startHour = v));
  value("hours-end", s.hoursWindow.endHour, (v) => (s.hoursWindow.endHour = v));
  checkbox("buffer-enabled", s.buffer.enabled, (v) => (s.buffer.enabled = v));
  value("buffer-min", s.buffer.minutes, (v) => (s.buffer.minutes = v));
  checkbox("block-enabled", s.minBlock.enabled, (v) => (s.minBlock.enabled = v));
  value("block-min", s.minBlock.minutes, (v) => (s.minBlock.minutes = v));
  checkbox("prompt-on-login", s.promptOnLogin, (v) => (s.promptOnLogin = v));
}

function checkbox(id: string, initial: boolean, set: (v: boolean) => void) {
  const el = $<HTMLInputElement>(id);
  el.checked = initial;
  el.addEventListener("change", () => {
    set(el.checked);
    void persist();
  });
}

function value(id: string, initial: number, set: (v: number) => void) {
  const el = $<HTMLInputElement | HTMLSelectElement>(id);
  el.value = String(initial);
  el.addEventListener("change", () => {
    set(Math.max(0, Number(el.value) || 0));
    const w = settings.hoursWindow;
    if (w.endHour <= w.startHour) {
      w.endHour = Math.min(24, w.startHour + 1);
      $<HTMLSelectElement>("hours-end").value = String(w.endHour);
    }
    void persist();
  });
}

function renderCalendars() {
  const box = $("calendars");
  const selected = new Set(settings.calendarIds ?? calendars.filter((c) => c.selected || c.primary).map((c) => c.id));
  box.replaceChildren(
    ...calendars.map((c) => {
      const label = document.createElement("label");
      label.className = "cal";
      const cb = Object.assign(document.createElement("input"), { type: "checkbox", checked: selected.has(c.id) });
      cb.onchange = () => {
        if (cb.checked) selected.add(c.id);
        else selected.delete(c.id);
        settings.calendarIds = calendars.map((x) => x.id).filter((id) => selected.has(id));
        $("reset-calendars").hidden = false;
        void persist();
      };
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = c.backgroundColor ?? "#999";
      label.append(cb, dot, c.summary + (c.primary ? " (primary)" : ""));
      return label;
    }),
  );
  $("reset-calendars").hidden = settings.calendarIds === null;
}

async function refreshAuth(interactive: boolean) {
  const status = $("auth-status");
  try {
    calendars = await bg<CalendarSummary[]>({ type: "listCalendars", interactive });
    status.textContent = `Connected · ${calendars.length} calendars found.`;
    status.className = "";
    $("sign-in").hidden = true;
    $("sign-out").hidden = false;
    renderCalendars();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    status.textContent = msg === NEEDS_SIGN_IN ? "Not connected." : msg;
    status.className = msg === NEEDS_SIGN_IN ? "" : "error";
    $("sign-in").hidden = false;
    $("sign-out").hidden = true;
  }
}

async function showUpdate() {
  const u = await bg<UpdateInfo | null>({ type: "getUpdate" }).catch(() => null);
  if (!u) return;
  const el = $("update");
  el.innerHTML = `⬆ when2max <b></b> is available (you have ${chrome.runtime.getManifest().version}). <a target="_blank" rel="noopener">Download</a> · <a target="_blank" rel="noopener">What's new</a><br>Unzip it over your current when2max folder, then click reload on chrome://extensions.`;
  el.querySelector("b")!.textContent = u.version;
  const [dl, notes] = el.querySelectorAll("a");
  dl.href = u.downloadUrl;
  notes.href = u.releaseUrl;
  el.hidden = false;
}

async function main() {
  $("version").textContent = `Version ${chrome.runtime.getManifest().version}`;
  void showUpdate();
  settings = await loadSettings();
  bindConstraints();
  $("sign-in").onclick = () => void refreshAuth(true);
  $("sign-out").onclick = async () => {
    await bg({ type: "signOut" });
    calendars = [];
    $("calendars").innerHTML = '<p class="hint">Connect your account to choose calendars.</p>';
    await refreshAuth(false);
  };
  $("reset-calendars").onclick = () => {
    settings.calendarIds = null;
    renderCalendars();
    void persist();
  };
  await refreshAuth(false);
}

void main();
