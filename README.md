# SP Net Worth Tracker

A personal net worth and asset allocation tracker. It shows what you own, how your wealth changes over time, and whether too much money sits in one asset or category.

Everything is entered by hand and stored in your browser. Signing in is optional and syncs the same portfolio across your devices. There are no bank connections or price feeds.

## Run it locally

Requires Node.js 20 or newer.

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5173/.

To build the production version into `dist/` and preview it:

```bash
npm run build
```

```bash
npm run preview
```

## What it does

- **Holdings (dashboard):** net worth, total assets and total debts, then every holding with category, value and percentage of total assets. Search, category filter, asset or debt filter, add, edit, delete, and a bulk "Update balances" flow.
- **Allocation:** your own categories with target percentages that must total exactly 100%. Each category shows actual against target, the difference in percentage points, and the amount over or under target.
- **History:** a chart for the entire portfolio or any single holding (value and share of total assets), with date ranges. Saved snapshots can be expanded to see their original holdings.
- **Settings:** sync across devices, currency label, JSON backup and Excel export, import, example portfolio, start over.

## How the numbers work

- Net worth = total assets minus total debts.
- Allocation percentages use total assets before debts, minus any category set outside the allocation (untick **Count in allocation** for things like a retirement account, a car or a rental deposit). Those still count fully in total assets and net worth. Untick **Include ...** under the net worth figure to see net worth without them; debts always count in full. The choice is remembered per device. Example: assets of 100,000 and debts of 12,500 give a net worth of 87,500, and an asset worth 30,000 is 30.0% of assets.
- Difference to target = actual % minus target %. Amount vs target = category value minus (target % x total assets).
- Amounts are added in whole cents, so totals never drift.
- Changing the currency changes the label only. No amounts are converted.

## Daily history and snapshots

Two separate records are kept:

| | Daily history | Saved snapshot |
| --- | --- | --- |
| Created | Automatically, whenever a balance changes or the app is opened | Only when you press Take snapshot |
| How many | One per calendar day, overwritten until the day ends | As many as you like, several per day allowed |
| Contains | Totals and each holding's value | Totals, date and time, and each holding's name, category, value and share of assets |
| Changes later | Only today's entry | Never. Editing, renaming, recategorising or deleting a holding leaves it untouched |
| On charts | #131313 line | #ffc61a dot with a #131313 outline |

Deleting a holding removes it from today's totals. Its earlier daily history and every snapshot that includes it are kept, and it stays selectable on the History page as "(deleted)".

## Sync across devices

Optional. In Settings, create an account with an email and password, confirm the email, and sign in on each device.

- Changes save to your account about 1 second after you make them.
- Other devices pick them up when the app is opened or comes back into view, or with **Sync now**.
- The example portfolio is never uploaded.
- Each save carries a revision number. If two devices changed the data since they last agreed, the app asks which copy to keep. It never overwrites one silently.
- Offline changes stay on the device and sync when the connection returns.
- Signing out keeps the data on the device and stops syncing.
- A **Continue with Google** button appears automatically once Google is enabled as a sign-in provider in the Supabase project.
- There is no password reset inside the app yet. Reset a password from the Supabase dashboard under Authentication, Users.

The sync service is a Supabase project. Its address and publishable key are in `.env`; both are public by design. The table definition and access rules are in `supabase/schema.sql`: one row per user, and a user can only read or write their own row. Delete the two lines in `.env` to run the app with no sync at all.

## Your data

- Saved in browser local storage under the key `sp-net-worth-tracker`, and in your account if you are signed in. Without sign-in, clearing site data erases it, so export a backup regularly.
- **Export** downloads one JSON file with everything.
- **Export to Excel** downloads a readable `.xlsx` with 6 sheets: Summary, Holdings, Allocation, Snapshots, Snapshot holdings and Daily history. It is for reading and analysis and cannot be imported again.
- **Import** validates the file first and names the exact problem if it is rejected (for example `holdings[0].value must be a number.`). Nothing is replaced until you confirm.
- Older files without a version number are accepted. Snapshots that hold totals only are kept as recorded and shown as totals only. No holdings or daily history are invented for them.

## Tests

Unit tests for calculations, editing, daily history, snapshots and backup:

```bash
npm test
```

Browser checks at 1440px and 390px wide (flows, persistence, measured text contrast, text sizes, focus outlines, layout), which also regenerate the images in `screenshots/`. Start the dev server first. This script needs Playwright with Chromium available to Node; it is not installed by `npm install`.

```bash
node scripts/verify.cjs
```

Sync between two devices, using a stand-in for the sync service so no real account is touched:

```bash
node scripts/verify-sync.cjs
```

## Project layout

```
src/
  types.ts            data model
  lib/calc.ts         totals, shares, allocation and targets
  lib/store.ts        every state change, daily history, snapshots
  lib/backup.ts       export, validation and import of backups
  lib/excel.ts        the Excel workbook export
  lib/sample.ts       the example portfolio
  lib/format.ts       money, percentage and date formatting
  components/         select, date picker, dialog, charts, forms, tables
  pages/              Dashboard (Holdings), Allocation, History, Settings
  sync.tsx            sign-in state and the sync engine
  lib/syncLogic.ts    when to push, pull or ask
supabase/schema.sql   the sync table and its access rules
scripts/verify.cjs    browser checks and screenshots
scripts/verify-sync.cjs  two-device sync checks
screenshots/          the app at 1440px and 390px wide
```
