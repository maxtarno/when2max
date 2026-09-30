# Installing when2max

when2max fills in your when2meet availability from your Google Calendar. You get a preview before anything is saved.

## Install (about 2 minutes)

1. Download **`when2max-<version>.zip`** from the [latest release](https://github.com/maxtarno/when2max/releases/latest) and unzip it. You'll get a `when2max` folder. Put it somewhere permanent, like Documents, because Chrome runs the extension from that folder.
2. Open **`chrome://extensions`** in Chrome.
3. Turn on **Developer mode** (toggle in the top-right). Leave it on.
4. Click **Load unpacked** and select the `when2max` folder.
5. Optional: click the puzzle-piece icon in the toolbar and pin when2max.

## Connect your calendar

1. Make sure Chrome is signed in (profile icon, top-right) with the Google account whose calendar you want to use.
2. Click the **when2max** icon, then **Connect Google Calendar**.
3. Google will say **"Google hasn't verified this app."** That's expected for a small personal project. Click **Advanced**, then **Go to when2max**, then **Continue**. when2max only asks for read-only calendar access.
4. Choose which calendars count as busy, and adjust your hours, buffer, and minimum gap if you like.

## Use it

Open any when2meet and sign in with your name. A panel opens in the bottom-right with your free time previewed on the grid:

- **Green stripes** are slots it will mark available. **Red stripes** are slots it will un-mark.
- Your calendar events are drawn on the grid. Hover any cell to see why it's busy or free.
- Click a striped cell to accept just that slot, or click **Apply to when2meet** for all of them. **Undo** reverts.
- All-day, declined, and "free" events don't block time. They're listed in the panel, and you can tick one to count it as busy.

## Updating

When a new version is out, the when2max panel and settings page show **"when2max X.Y is available."**

1. Download the new zip and unzip it **over your existing `when2max` folder** (replace the files).
2. On `chrome://extensions`, click the reload ↻ icon on when2max.
3. Refresh any open when2meet tabs.

Your settings and calendar connection are kept.

## Troubleshooting

- **"Access blocked" or `admin_policy_enforced`**: your school or work account blocks outside apps. Share that calendar with a personal Gmail and sign Chrome into the Gmail instead.
- **"when2max was updated or reloaded"**: refresh the when2meet page.
- **Nothing happens after signing in on when2meet**: click the 📅 when2max button in the bottom-right corner.
