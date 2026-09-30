import type { UpdateInfo } from "../shared/types";

const LATEST_RELEASE = "https://api.github.com/repos/maxtarno/when2max/releases/latest";
const ALARM = "when2max-update-check";

/** Check GitHub for a newer release once a day, caching the result in storage. */
export function scheduleUpdateChecks() {
  // The service worker restarts often; only create the alarm once so the 24h period isn't reset.
  void chrome.alarms.get(ALARM).then((existing) => {
    if (!existing) void chrome.alarms.create(ALARM, { periodInMinutes: 24 * 60 });
  });
  chrome.alarms.onAlarm.addListener((a) => {
    if (a.name === ALARM) void checkForUpdate();
  });
}

export async function checkForUpdate(): Promise<void> {
  try {
    const res = await fetch(LATEST_RELEASE, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return; // 404 = no releases yet; anything else, try again tomorrow
    const rel: { tag_name: string; html_url: string; assets?: { name: string; browser_download_url: string }[] } = await res.json();
    const zip = rel.assets?.find((a) => a.name.endsWith(".zip"));
    const info: UpdateInfo = {
      version: rel.tag_name.replace(/^v/, ""),
      releaseUrl: rel.html_url,
      downloadUrl: zip?.browser_download_url ?? rel.html_url,
    };
    await chrome.storage.local.set({ latestRelease: info });
  } catch {
    // Offline or rate-limited; the next alarm retries.
  }
}

/** The latest release, if it's newer than the installed version. */
export async function availableUpdate(): Promise<UpdateInfo | null> {
  const { latestRelease } = await chrome.storage.local.get("latestRelease");
  const info = latestRelease as UpdateInfo | undefined;
  if (!info) return null;
  return isNewer(info.version, chrome.runtime.getManifest().version) ? info : null;
}

export function isNewer(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0;
  }
  return false;
}
