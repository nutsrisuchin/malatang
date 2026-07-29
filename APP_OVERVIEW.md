# Didi Malatang Hub — App Overview

A complete, human-readable description of what this app is and how it's built, from backend to
frontend to visual design. Where `CLAUDE.md` is written *for an AI coding assistant* (terse,
gotcha-focused, assumes you're already reading the code), this file is written *for a person* —
a developer, or a restaurant owner deciding whether to reuse this app for another location.

---

## 1. What this app is

A single-page web app for running the daily operations of **Didi Malatang**, a malatang
restaurant, covering:

- **Staff timesheet & payroll** — clock-in/out, monthly scheduling, day-rate pay calculation
- **Ingredient warehouse** — stock levels, photos, restock-priority forecasting
- **Routine checklists** — recurring food-safety-style tasks with sub-tasks and photo reports
- **Role-based admin** — four permission tiers from Employee up to App Owner
- **Financial projections** — expected monthly salary per employee
- **Notifications** — an in-app activity feed

The whole UI is in Thai. It's used on staff phones (iPhone and Android) as well as desktop, and
is designed to be added to a phone's home screen like a native app icon.

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Frontend | Plain HTML + CSS + JavaScript — **no framework** (no React/Vue/etc.), **no build step**, no `package.json`, no bundler |
| Backend | Firebase — **Firestore** (database) + **Firebase Authentication** only |
| File storage | None — Firebase Storage requires a paid plan the restaurant doesn't use; photos are compressed client-side and stored as inline base64 text instead (see §4) |
| Hosting | **GitHub Pages** — static files served directly from the repo, auto-deployed on every push to `main` |
| Backend compute | None — no Cloud Functions, no server of any kind. Everything runs in the visiting browser |

This is a deliberately minimal stack: five source files (`index.html`, `styles.css`, `app.js`,
`db.js`, `firebase-config.js`) plus a couple of config/asset files, all readable top to bottom
with no compilation step between editing a file and it being live.

### File map

| File | What it holds |
|---|---|
| `index.html` | Page shell: login form, top navigation bar, sidebar, the empty `#view`/`#modal-host` containers everything else renders into |
| `styles.css` | All visual styling — colors, layout, responsive rules — one file, no preprocessor |
| `app.js` | Almost everything: app state, all screen rendering, all click/form handling, all business logic (~1,900 lines) |
| `db.js` | The only file that talks to Firebase directly — a small wrapper around Firestore reads/writes and Auth |
| `firebase-config.js` | The Firebase project's public config (project ID, API key, etc.) — not secret, safe to commit |
| `firestore.rules` | Server-side security rules — **must be manually pasted into the Firebase console**, this repo doesn't deploy it automatically |
| `manifest.json` | Web app manifest — name + icon used when Android "installs" the site to a home screen |
| `logo.jpg` | The restaurant's logo, used on the login page, top bar, home page, browser tab icon, and home-screen icon |

---

## 3. Frontend architecture

### 3.1 State, not a router

There's one JavaScript object, `state`, holding everything the UI needs: the logged-in user, the
current screen name (`state.view`), and an array for every Firestore collection (`state.staff`,
`state.attendance`, `state.warehouseItems`, …). There is no client-side router or URL-based
navigation — `state.view` is just a string like `'home'` or `'timesheet'`, and a big
`if/else` in `render()` picks which screen-building function to call based on it.

### 3.2 Live sync via Firestore listeners

Each Firestore collection gets a live subscription (`onSnapshot`) that fires every time *any*
device changes that data. When it fires, the matching array in `state` gets replaced and the
screen re-renders — so if a manager marks someone present on their phone, the owner's laptop
updates within about a second with no manual refresh and no polling.

Writes are optimistic: clicking a button updates `state` immediately (so the screen reflects the
change instantly), *then* sends the write to Firestore. The confirming update from Firestore's
own listener arrives a moment later and just overwrites the same data — invisible to the user.

### 3.3 Rendering: rebuild, don't diff

Every screen is a plain JavaScript function that returns a big string of HTML (via template
literals), which gets dropped straight into the page with `.innerHTML =`. There's no virtual DOM
and no diffing — the entire visible screen is thrown away and rebuilt from scratch on every
change. This is simple and fast enough at this app's scale (a handful of screens, small data
volumes), at the cost of things like text-input focus not surviving a re-render mid-keystroke —
a real constraint, but not one this app's forms currently run into.

### 3.4 One dispatch pattern for every button

Every clickable element in the app carries a `data-action="..."` attribute (e.g.
`data-action="mark-attendance"`). A single generic listener reads that attribute and routes the
click to one giant `handleAction(action, data)` function containing every mutation the app can
perform, each gated by its own permission check. Forms work the same way via `data-form="..."`
and a matching `handleForm(name, formData)`. This means there is exactly one place to look when
tracing what a button does, no matter which screen it's on.

### 3.5 A small popup (modal) system

Most of the app renders directly into the page (no popups) — but three specific interactions use
a lightweight modal system: editing a day's schedule, editing an existing staff member's info,
and changing your own PIN. Each is its own popup with a dimmed backdrop; clicking outside the
popup card closes it. This was added specifically because one screen (the monthly schedule grid)
made "scroll down to an editing panel" impractical — everywhere else in the app intentionally
avoids popups in favor of inline sections.

---

## 4. Backend & data

### 4.1 Authentication — PIN-based, not "real" accounts

Staff don't type an email address. They type their **name** and a **PIN**. Behind the scenes,
each person is actually a real Firebase Authentication user under a synthetic email address
generated from their name (e.g. a name that slugifies to `somchai` becomes
`somchai@<restaurant-domain>.local`), with their PIN used as the password. Firebase's own login
system does the real security check — the "name + PIN" experience is just a friendlier UI over
standard email/password auth.

One fixed **App Owner** account (created once, manually, in the Firebase console) is trusted
unconditionally, so the restaurant can never be locked out of its own system even before any
other account exists.

Creating a *new* staff login without logging the admin out of their own session uses a small
trick: a second, throwaway Firebase connection is spun up just long enough to create the new
account, then torn down. Changing your *own* PIN is much simpler — Firebase lets a signed-in user
update their own password directly, no trick required.

One real limitation worth knowing: there is **no way to fully delete a login from inside the
app**. "Remove employee" only deletes their profile record — the underlying login technically
still exists (orphaned) until someone manually deletes it from the Firebase console. Fully
deleting an Auth account requires Firebase's admin-only API, which needs a server this app
doesn't have.

### 4.2 Database — Firestore collections

| Collection | Purpose |
|---|---|
| `staff` | Every login account: name, role, employment type, daily pay rate |
| `attendance` | One record per staff member per day: clock-in/out, lateness, day-off flag, computed pay |
| `warehouseItems` | Current ingredient/supply stock: name, category, quantity, unit, photo |
| `warehouseLogs` | A timestamped history of quantity changes, used to estimate how fast stock is being used |
| `routines` | Checklist definitions: name, instructions, sub-tasks, how often it repeats |
| `routineInspections` | A log of every time a checklist was completed, with who/when/what was ticked |
| `notifications` | The in-app activity feed |
| `holidays` | Admin-picked dates that pay 1.5× |

(Full field-by-field detail is in `CLAUDE.md`'s Data Model section — this table is the shape,
not the exhaustive spec.)

### 4.3 Security — enforced on the server, not just hidden in the UI

Every permission rule that matters is duplicated in **Firestore Security Rules**
(`firestore.rules`), which run on Firebase's servers and can't be bypassed by editing the
browser's JavaScript. The UI hiding a button is just convenience — the actual gate is the
server-side rule plus a matching check in the click handler. A rule of thumb followed throughout
this app: if a permission is worth enforcing, it needs to exist in *three* places — the UI (hide
the button), the click handler (re-check before writing), and the Firestore rule (reject the
write server-side even if someone bypasses the first two).

### 4.4 No file storage — photos as compressed inline data

Firebase Storage (for uploading photo files) requires a paid billing plan this restaurant hasn't
enabled. Instead, every photo (warehouse items, checklist reports) is resized down to a small
JPEG in the browser itself (canvas-based compression, roughly 640px wide) and stored as inline
base64 text directly on the database record. This keeps costs at zero but caps how large/detailed
photos can be — Firestore has a hard 1MiB-per-document ceiling.

---

## 5. Roles & permissions

Four tiers, each one able to do everything the tier below it can:

| Role | Can do |
|---|---|
| **App Owner** | Everything, including changing anyone's role. The one account that can never be removed. |
| **Admin** | Manage all staff (except the Owner), edit anyone's pay rate, see the Financial section, manage warehouse/checklists/notifications. |
| **Manager** | Add/remove regular employees, mark attendance, plan the monthly schedule, manage warehouse stock and checklists. **Cannot see anyone's pay rate or computed pay — not even their own.** Cannot reach Admin or Financial screens at all. |
| **Employee** | Log in, complete checklists, view their own read-only monthly schedule. Everything else is read-only or hidden. |

The Manager pay-blindness is a deliberate business rule, not an oversight — salary visibility is
Admin-and-above only, enforced in the UI, the click handlers, *and* the Firestore rules.

---

## 6. Features, screen by screen

### หน้าหลัก (Home)
A dashboard: today's attendance count, checklists needing attention, a warehouse-health
summary (tap it to jump straight to the restock-priority list), and the 5 most recent
notifications.

### ลงเวลา (Timesheet)
- **For Manager and above**: a daily "who's in today" panel (collapsed by default) for quick
  one-tap attendance marking, plus a **monthly schedule grid** — one row per day, one column per
  employee. The default assumption is *everyone works their normal hours every day*; a manager's
  actual job here is just marking exceptions (a day off, someone closing the till for a bonus, or
  correcting an exact late-arrival time) by tapping a cell, which opens a small popup.
- **For Employees**: a simplified, read-only version of just their own monthly grid — no editing,
  no daily panel.
- Admin/Owner can also **edit any existing staff member's info** (name, role, employment type,
  pay rate) from the Admin page, and it reflects on this screen instantly.
- Anyone can **change their own PIN** from a button in the top bar.

### คลังสินค้า (Warehouse)
A photo-and-quantity inventory list grouped into collapsible categories. Each item's quantity can
be updated inline, and photos can be added or replaced at any time (from camera or photo
library). A **"restock priorities"** section automatically estimates, from the history of past
quantity changes, roughly how many days of stock remain for each item and what to reorder —
without needing any manual data entry beyond the normal quantity updates.

### เช็คลิสต์ (Checklist)
Recurring task lists (e.g. daily cleaning checks) with optional sub-tasks, free-text instructions,
and an optional "before opening / after closing" time tag. A checklist can recur either on a
fixed day-interval ("every 7 days") or on specific weekdays. Completing one opens a report with
tickable sub-tasks, optional notes, and an optional photo — every submission is logged so there's
a history of who did what and when.

### แอดมิน (Admin) — Admin/Owner only
Create new staff/admin accounts and edit existing ones.

### การเงิน (Financial) — Admin/Owner only
Pick a month and see every paid employee's expected salary for it, computed day-by-day from
actual attendance where it exists and an on-time assumption where it doesn't. Also where daily
pay rates are set/edited, and where public holidays (which trigger 1.5× pay) are managed.

### แจ้งเตือน (Notifications)
A flat activity feed — every meaningful change in the app (attendance edits, new staff, stock
imports, pay-rate changes, checklist reports…) posts here, naming who did it.

---

## 7. Key business rules

- **Schedule**: fixed 09:30–20:30 every day, no weekday/weekend split. 1 hour unpaid lunch baked
  in (10 paid hours).
- **Pay**: every employee has their own flat daily rate (not hourly, no overtime). A day's pay is
  `dailyRate`, reduced ฿40 for every full hour late, multiplied ×1.5 on a designated holiday, and
  with a flat +฿50 bonus if that person was marked as having closed the till that day.
- **Default-present assumption**: a day with no explicit record is assumed to be a normal worked
  day at full pay — a manager's real job in the schedule grid is marking the *exceptions*
  (days off), not confirming every normal day.
- **Restock forecasting**: average daily usage is calculated only from periods where quantity
  actually *decreased* (so restocking doesn't read as negative usage), then projected forward to
  flag what needs reordering soon.

---

## 8. Look, theme, and language

- **Language**: the entire interface is Thai. The one deliberate exception is the brand name
  itself ("Didi Malatang"), which stays in English/Thai-script-neutral everywhere it appears.
  Internally, values the code compares against (role names, status codes) stay in English in the
  database and are translated only for display — so relabeling text never risks breaking a
  permission check.
- **Color palette**: sampled directly from the restaurant's logo — a deep red primary color, a
  gold accent, and a warm cream background. Defined once as CSS custom properties
  (`--color-primary`, `--color-gold`, `--color-bg`, etc.) so the whole app's look flows from a
  handful of values.
- **Logo placement**: the login page, the top navigation bar, the home page header, the browser
  tab favicon, and the phone home-screen icon (via `manifest.json` for Android and
  `apple-touch-icon` for iOS — the two platforms don't share one mechanism).
- **Mobile-first rules**: every input is large enough to avoid iOS's auto-zoom-on-focus, every
  tappable element sized for a thumb (not a mouse pointer), no reliance on hover states (nothing
  works on touch), and the layout collapses to a single column below 900px and 650px breakpoints.

---

## 9. Deployment & setup (to run a copy of this app)

1. **Create a Firebase project** (console.firebase.google.com) with **Firestore** and
   **Authentication** (email/password sign-in method) both enabled.
2. **Copy `firestore.rules`'s contents into that project's Firestore Rules tab** and publish —
   this repo never deploys rules automatically; every rules change has to be re-pasted manually.
3. **Manually create the bootstrap App Owner user** in Firebase Authentication → Add user, using
   the fixed owner email this app expects and a chosen PIN as the password.
4. **Fill in `firebase-config.js`** with that project's config values (found in the Firebase
   console's project settings) — these are not secret and are safe to commit.
5. **Push the repo to GitHub** and enable **GitHub Pages** (Settings → Pages → deploy from the
   `main` branch). Every future push to `main` auto-deploys — there's no build step and no
   staging environment.
6. Log in as `Owner` with the PIN set in step 3 — this bootstraps that account's own staff profile
   automatically on first login, after which it can create every other account from inside the app.

---

## 10. Known limitations (by design, not oversights)

- **No offline/installable PWA** — the home-screen icon looks like an app, but there's no service
  worker; it's still just a live website, requiring a network connection every time.
- **Notifications can duplicate** — since there's no server-side scheduler, "overdue checklist"
  notifications are generated by whichever browser tab happens to be open when something crosses
  into overdue; two devices open at the same moment can each write one.
- **No hard account deletion** — removing a staff member removes their in-app profile but not
  their underlying login, which needs a manual Firebase console step to fully delete.
- **Full-time vs. part-time is now purely a label** — both employment types use the exact same
  day-rate pay formula; the distinction no longer changes any calculation.
- **iOS Safari has occasional quirks not fully verified on-device** (native month/date pickers,
  camera-capture input behavior) — flagged inline in `CLAUDE.md` wherever they come up.
