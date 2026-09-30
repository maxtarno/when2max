import { NEEDS_SIGN_IN, type CalEvent, type CalendarSummary } from "../shared/types";

const API = "https://www.googleapis.com/calendar/v3";

export async function getToken(interactive: boolean): Promise<string> {
  try {
    const { token } = await chrome.identity.getAuthToken({ interactive });
    if (!token) throw new Error("No token returned");
    // Remembered so an expired connection can reconnect automatically instead of asking first.
    await chrome.storage.local.set({ connectedBefore: true });
    return token;
  } catch (e) {
    throw new Error(explainAuthError(String((e as Error).message ?? e)));
  }
}

function explainAuthError(msg: string): string {
  if (/admin_policy_enforced|access_denied|org_internal|disallowed/i.test(msg)) {
    return (
      "Google refused access to your calendar. Brown's Google Workspace probably blocks " +
      "unverified third-party apps. Ask Brown IT to allowlist this OAuth client, or use a " +
      "personal Gmail with your Brown calendar shared to it. (" + msg + ")"
    );
  }
  if (/not signed in|user is not signed in/i.test(msg)) {
    return "Chrome isn't signed in to a Google account. Sign in to Chrome with your Brown account first.";
  }
  if (/did not approve|canceled|cancelled/i.test(msg)) return "Google sign-in was cancelled.";
  if (/not granted or revoked/i.test(msg)) return NEEDS_SIGN_IN;
  if (/bad client id|invalid_client/i.test(msg)) {
    return "OAuth isn't configured. Set oauth2.client_id in manifest.json (see README). (" + msg + ")";
  }
  return msg;
}

async function api<T>(path: string, token: string): Promise<T> {
  const res = await fetch(API + path, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    await chrome.identity.removeCachedAuthToken({ token });
    throw new RetryableAuthError();
  }
  if (!res.ok) throw new Error(`Calendar API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

class RetryableAuthError extends Error {}

/** Run fn with a token, refreshing it once if Google says it expired. */
async function withToken<T>(interactive: boolean, fn: (token: string) => Promise<T>): Promise<T> {
  try {
    return await fn(await getToken(interactive));
  } catch (e) {
    if (e instanceof RetryableAuthError) return fn(await getToken(interactive));
    throw e;
  }
}

interface ApiCalendar {
  id: string;
  summary: string;
  summaryOverride?: string;
  primary?: boolean;
  selected?: boolean;
  backgroundColor?: string;
}

export function listCalendars(interactive: boolean): Promise<CalendarSummary[]> {
  return withToken(interactive, async (token) => {
    const items: ApiCalendar[] = [];
    let pageToken: string | undefined;
    do {
      const q = new URLSearchParams({ maxResults: "250" });
      if (pageToken) q.set("pageToken", pageToken);
      const page = await api<{ items: ApiCalendar[]; nextPageToken?: string }>(`/users/me/calendarList?${q}`, token);
      items.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return items.map((c) => ({
      id: c.id,
      summary: c.summaryOverride ?? c.summary,
      primary: !!c.primary,
      selected: !!c.selected,
      backgroundColor: c.backgroundColor,
    }));
  });
}

interface ApiEvent {
  id: string;
  summary?: string;
  status?: string;
  transparency?: "opaque" | "transparent";
  eventType?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
}

export async function fetchEvents(calendarIds: string[], timeMin: number, timeMax: number): Promise<CalEvent[]> {
  return withToken(false, async (token) => {
    const perCal = await Promise.all(calendarIds.map((id) => fetchCalendarEvents(token, id, timeMin, timeMax)));
    return perCal.flat();
  });
}

async function fetchCalendarEvents(token: string, calendarId: string, timeMin: number, timeMax: number): Promise<CalEvent[]> {
  const out: CalEvent[] = [];
  let pageToken: string | undefined;
  do {
    const q = new URLSearchParams({
      timeMin: new Date(timeMin).toISOString(),
      timeMax: new Date(timeMax).toISOString(),
      singleEvents: "true",
      maxResults: "2500",
    });
    if (pageToken) q.set("pageToken", pageToken);
    const page = await api<{ items: ApiEvent[]; nextPageToken?: string }>(
      `/calendars/${encodeURIComponent(calendarId)}/events?${q}`,
      token,
    );
    for (const e of page.items ?? []) {
      // Working-location markers ("Home", "Office") aren't commitments.
      if (e.status === "cancelled" || e.eventType === "workingLocation") continue;
      const allDay = !e.start.dateTime;
      out.push({
        id: `${calendarId}:${e.id}`,
        calendarId,
        title: e.summary ?? "(no title)",
        start: allDay ? parseLocalDate(e.start.date!) : Date.parse(e.start.dateTime!),
        end: allDay ? parseLocalDate(e.end.date!) : Date.parse(e.end.dateTime!),
        allDay,
        declined: e.attendees?.some((a) => a.self && a.responseStatus === "declined") ?? false,
        markedFree: e.transparency === "transparent",
      });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return out;
}

/** "2026-10-05" -> local midnight, matching how Google Calendar shows all-day events. */
function parseLocalDate(d: string): number {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).getTime();
}
