import { loadSettings } from "../shared/settings";
import type { BgRequest, BgResponse } from "../shared/types";
import { fetchEvents, getToken, listCalendars } from "./calendar";
import { availableUpdate, checkForUpdate, scheduleUpdateChecks } from "./updates";

chrome.runtime.onMessage.addListener((req: BgRequest, _sender, sendResponse) => {
  handle(req).then(
    (data) => sendResponse({ ok: true, data } satisfies BgResponse<unknown>),
    (e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) } satisfies BgResponse<unknown>),
  );
  return true; // keep the channel open for the async response
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

scheduleUpdateChecks();
chrome.runtime.onInstalled.addListener(() => void checkForUpdate());
chrome.runtime.onStartup.addListener(() => void checkForUpdate());

async function handle(req: BgRequest): Promise<unknown> {
  switch (req.type) {
    case "signIn":
      await getToken(true);
      return null;
    case "signOut": {
      const token = await getToken(false).catch(() => null);
      if (token) {
        await chrome.identity.removeCachedAuthToken({ token });
        await chrome.storage.local.remove("connectedBefore");
        await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, { method: "POST" }).catch(() => {});
      }
      return null;
    }
    case "listCalendars":
      return listCalendars(req.interactive);
    case "fetchEvents": {
      const settings = await loadSettings();
      let ids = settings.calendarIds;
      if (!ids) ids = (await listCalendars(false)).filter((c) => c.selected || c.primary).map((c) => c.id);
      return fetchEvents(ids, req.timeMin, req.timeMax);
    }
    case "getUpdate":
      return availableUpdate();
    case "openOptions":
      await chrome.runtime.openOptionsPage();
      return null;
  }
}
