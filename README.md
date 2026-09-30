# when2max

A Chrome extension that fills in your [when2meet](https://www.when2meet.com) availability from Google Calendar.

Sign in on a when2meet page and a panel appears with your free time previewed on the grid (green stripes = will be added, red = will be removed). Click **Apply** to save it, or **Undo** afterwards.

While the panel is open, your calendar events are drawn over the grid: solid blue for events that block time, faded and dashed for ignored ones, and a strip at the top of the day for all-day events. Hover any cell to see why it's busy or free (event, buffer, outside your hours, or too-short gap). Untick **Show events on grid** to hide them.

## What counts as free

A 15-minute slot is free when it doesn't overlap a busy event from your chosen calendars, subject to these settings (each can be toggled):

| Setting | Default |
|---|---|
| Only mark free between | 8 AM – 6 PM |
| Buffer before/after events | 15 min |
| Skip free gaps shorter than | 30 min |

**All-day events, declined invites, and events shown as "free"** never block time, but they're listed in the preview under "⚠ N events not blocking time". Tick one to count it as busy for that fill.

**Existing availability is replaced** so your grid matches your calendar. The preview shows exactly what changes before anything is saved.

**Weekday polls** ("Mon / Wed", no dates) are filled from the next occurrence of each day, starting today. The panel says which dates it used.

## Setup

### 1. Build

```sh
npm install
npm run build        # outputs dist/
```

### 2. Load it in Chrome

1. Go to `chrome://extensions` and turn on **Developer mode**.
2. **Load unpacked** → choose the `dist/` folder.
3. The extension ID should be **`onaakgedbnjfgkcnkfaehhncmadphpde`**. It's pinned by the `key` in `public/manifest.json`, so it stays the same across machines and rebuilds.

### 3. Create the Google OAuth client (one time)

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create a project (e.g. "when2max").
2. **APIs & Services → Library** → enable **Google Calendar API**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External** (or Internal if your Workspace allows it)
   - Fill in the app name and your email
   - Scopes: add `.../auth/calendar.readonly`
   - **Test users**: add the Google account whose calendar you'll read
   - Leave publishing status as **Testing** (no Google verification needed for personal use)
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Chrome Extension**
   - Item ID: `onaakgedbnjfgkcnkfaehhncmadphpde`
5. Copy the client ID into `public/manifest.json` → `oauth2.client_id`, then `npm run build` and click reload on `chrome://extensions`.

### 4. Connect

Click the extension icon → **Connect Google Calendar**, then choose which calendars count as busy.

`chrome.identity` uses the Google account **signed into Chrome**, so the Chrome profile needs to be signed in with the account that owns the calendar.

### Brown / Google Workspace accounts

Workspace admins can block unverified third-party OAuth apps. If connecting fails with `admin_policy_enforced` or `access_denied`, either:

- ask Brown IT to allowlist the OAuth client ID, or
- share your Brown calendar with a personal Gmail (Google Calendar → Settings → Share with specific people → "See all event details") and sign Chrome into that account instead.

## Development

```sh
npm run watch      # rebuild on change, then reload the extension
npm test           # unit tests for the availability logic
npm run typecheck
```

### How it works

| File | Runs in | Job |
|---|---|---|
| `src/background/` | service worker | OAuth via `chrome.identity`, Google Calendar API calls |
| `src/content/` | when2meet page (isolated world) | Preview panel, grid highlights, orchestration |
| `src/page/` | when2meet page (**main** world) | Reads when2meet's globals (`TimeOfSlot`, `AvailableAtSlot`, `UserID`), detects login, saves |
| `src/shared/availability.ts` | — | Pure free/busy logic (unit tested) |
| `src/options/` | options page | Account, calendars, constraints |

when2meet doesn't have an API. The page script saves by posting to `SaveTimes.php` the same way when2meet's own drag handler does: one request to add slots, one to remove them. If when2meet changes its page script, `src/page/index.ts` is the file to update.

Weekday-only polls use fake timestamps in a fixed week of November 1978, read as UTC wall-clock time. `resolveSlots` maps them to real dates.

## Privacy

Calendar data is read with a read-only scope. It stays inside the extension and goes only to Google's API. The only thing sent to when2meet is which slots you're available for.
