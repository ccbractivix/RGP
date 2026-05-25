# Activities Scheduler — Setup & Usage Guide

Everything you need to know to get this running, even if you've never touched server code before.

---

## What Was Built

| Piece | What it does |
|---|---|
| `activities-backend/` | The brain. Runs on a server, talks to the database, handles all the data |
| `activities-web/` | The faces. The pages guests and staff actually see |

---

## Part 1 — Setting Up the Backend

### Step 1: Create a PostgreSQL Database

You need a free database. The easiest option is **Neon** (neon.tech) or you can use any existing Postgres instance you already have for a low-traffic service.

1. Go to [neon.tech](https://neon.tech) and create a free account.
2. Create a new project — call it anything (e.g. `activities`).
3. Copy the **Connection String** — it looks like:  
   `postgresql://user:password@host.neon.tech/activities`  
   You'll need this in Step 3.

The tables are **created automatically** the first time the backend starts. You don't need to run any SQL manually.

---

### Step 2: Deploy the Backend on Render

1. Go to [render.com](https://render.com) and sign in.
2. Click **New → Web Service**.
3. Connect your GitHub repo (`ccbractivix/RGP`).
4. Set the **Root Directory** to `activities-backend`.
5. Set **Build Command** to: `npm install`
6. Set **Start Command** to: `node server.js`
7. Choose the **Free** plan (or paid if you need it always-on).

---

### Step 3: Set Environment Variables

Still on the Render service page, go to **Environment → Add Environment Variable** and add each of these:

| Variable | What to put |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | The PostgreSQL connection string from Step 1 |
| `ADMIN_PASSPHRASE` | A secret passphrase — you'll use this to log into the Schedule Builder (make it something you'll remember but others won't guess) |
| `SESSION_SECRET` | A long random string — mash your keyboard, something like `k8xQp2!mNvR4...` (just needs to be long and random) |
| `CORS_ORIGIN` | `https://ccbractivix.github.io` |
| `ACTIVITY_CODES` | One or more 4-digit codes for the activities staff cancel/relocate tool, separated by commas — e.g. `1234,5678` |

After adding all variables, click **Save** and wait for the service to redeploy.

---

### Step 4: Note Your Backend URL

Once deployed, Render gives your service a URL like:  
`https://activities-backend-xxxx.onrender.com`

Copy this URL. You'll need to put it in a few places.

---

### Step 5: Update the Backend URL in the Frontend Files

Open these five files in the repo and change the `api-base` or `api-url` `<meta>` tag near the top to your actual Render URL:

| File | Tag to update |
|---|---|
| `activities-backend/admin-ui/login.html` | `<meta name="api-base" content="…">` |
| `activities-backend/admin-ui/library.html` | `<meta name="api-base" content="…">` |
| `activities-backend/admin-ui/dashboard.html` | `<meta name="api-base" content="…">` |
| `activities-web/index.html` | `<meta name="api-url" content="…/api/schedule">` |
| `activities-web/admin.html` | `<meta name="api-url" content="…">` |
| `activities-web/tv.html` | `<meta name="api-url" content="…/api/schedule/tv">` |
| `activities-web/today.html` | `<meta name="api-url" content="…/api/schedule/today">` |
| `activities-web/newslide.html` | `<meta name="api-url" content="…/api/schedule">` |

Replace `https://activities-backend.onrender.com` with your actual URL in each file.

---

### Step 6: Images (the `/static` folder)

Activity images are served from the `static/` folder at the **root of the repo**.

To add an image for an activity:
1. Put your image file (e.g. `pool-party.jpg`) in the `static/` folder in the repo.
2. When you add that activity in the Library Builder, just type `pool-party.jpg` in the **Image Filename** field.

The image will then appear on the web schedule and TV displays.

---

## Part 2 — Using the Schedule Builder (Staff Admin)

### Accessing the Schedule Builder

Go to your backend URL in a browser:  
`https://your-activities-backend.onrender.com`

You'll be redirected to the login page. Enter the **Admin Passphrase** you set in Step 3.

---

### Building the Activity Library

Before you can schedule anything, you need activities in the library.

1. After logging in, click **📚 Library** in the top right.
2. Click **＋ Add Activity**.
3. Fill in the form:
   - **Activity ID** — a unique code like `ACT-WATERSLIDE` or `ACT-POOLSWIM`. Must start with `ACT-` followed by letters/numbers only, no spaces.
   - **Activity Name** — what guests will see (e.g. "Water Slide Races").
   - **Venue** — pick from the dropdown list.
   - **Duration** — how long the activity lasts in minutes.
   - **Price** — leave blank if it's free. If you type a price, it will be shown on the schedule.
   - **Additional Info Lines** — optional extra notes (e.g. "Ages 7 and up", "Wristbands required"). Leave blank and they won't appear on the schedule at all.
   - **Image Filename** — optional. The filename of an image you put in the `static/` folder (e.g. `pool-party.jpg`).
   - **⭐ Featured Activity** — check this box if you want this activity to appear in the yellow featured panel at the top of the web and TV schedules.

4. Click **Add Activity**.

Repeat for each activity. You can always edit or delete activities later.

---

### Building the Schedule

1. From the admin, click **📅 Schedule** (or you're taken there after login).
2. You'll see a 7-day calendar grid across the top. Click any day column to select it.
3. In the panel on the right, click **＋ Add Activity**.
4. Select an activity from the dropdown and set the start time.
5. Click **Add**.
6. When the day looks right, click **💾 Save Day**.

**Tip — Copy Last Week:**  
Click **📋 Copy Last Week** to copy the previous week's schedule into the current week. Anything already on the current week won't be overwritten. Great for repeating weekly programs.

**Week Navigation:**  
Use the ← and → arrows at the top to move between weeks.

---

### Cancel or Relocate an Activity (from the Schedule Builder)

In the day editor on the right:
- **⛔** button — marks the activity as Canceled. Guests will see red strikethrough text.
- **📍** button — opens a popup to pick a new venue. Guests will see the updated venue in red.
- **↩** button — restores a canceled or relocated activity back to normal.

---

## Part 3 — The Operator Cancel/Relocate Tool (activities-web/admin.html)

This is a simpler tool for activities staff to use in the moment — no passphrase needed, just a short code.

### Accessing it

Visit:  
`https://ccbractivix.github.io/RGP/activities-web/admin.html`

Enter one of the codes you set in `ACTIVITY_CODES` (e.g. `1234`).

### How it works

- The screen shows **today's activities** with just the time and name.
- **Tap any activity** to open an action popup.
- Choose **⛔ Cancel Activity** or **📍 Relocate Activity**.
  - If you choose Relocate, a list of venues appears. The default is **Caribe Room**. Pick a different one, or choose **Other…** to type in a custom location.
  - Tap **↩ Restore Activity** to undo a cancel or relocate.
- Changes go live immediately on all displays (next refresh cycle).

---

## Part 4 — The Guest-Facing Pages

### activities-web/index.html — Full Week Schedule

- Shows today plus the next 6 days (always a full 7-day view).
- Today's date is always first; it rolls over automatically at midnight.
- Featured activities appear in the top-right panel of the header.
- Canceled activities show in red strikethrough with "Activity Canceled" underneath.
- Relocated activities show the new venue in red with "Change of plans, meet up at…"
- There's a link to the Amenities status page in the nav bar.

### activities-web/tv.html — 4-Day TV Display

- Designed for a TV or large display — fill-screen layout.
- Shows today + the next 3 days in 4 columns.
- Featured activities appear in the green panel on the right side of the header.
- Bottom-left: QR code linking to the full web schedule + text directions.
- Bottom-right: "Dawn to Dusk / Basketball, Volleyball, Pickleball and More!"
- Auto-refreshes every 5 minutes to pick up cancellations and relocations.

### activities-web/today.html — Today-Only TV Screen

- Just today's schedule, big and easy to read on a TV.
- Shows time and activity name for each entry.
- Updates with canceled/relocated status automatically every 5 minutes.
- Same bottom bar as tv.html (QR code + sports info).

### activities-web/newslide.html — Branded Slide Layout

- Uses `static/images/HICV_ACTIVIX_base.jpg` as a full-screen background.
- Places today's schedule in the left-side layout box and the next 4 days in the lower-right box.
- Uses the same schedule API as the guest web page and refreshes automatically every 5 minutes.

---

## Quick Reference — URLs

| Page | URL |
|---|---|
| Guest full schedule | `https://ccbractivix.github.io/RGP/activities-web/index.html` |
| Operator control (cancel/relocate) | `https://ccbractivix.github.io/RGP/activities-web/admin.html` |
| 4-day TV display | `https://ccbractivix.github.io/RGP/activities-web/tv.html` |
| Today-only TV screen | `https://ccbractivix.github.io/RGP/activities-web/today.html` |
| Branded slide layout | `https://ccbractivix.github.io/RGP/activities-web/newslide.html` |
| Admin schedule builder | `https://your-backend.onrender.com` |
| Admin library builder | `https://your-backend.onrender.com/admin-ui/library.html` |

---

## Troubleshooting

**The schedule shows "Unable to load schedule"**  
→ The backend is probably asleep (free Render plans sleep after 15 minutes of inactivity). Visit the backend URL directly in a browser to wake it up, then refresh the schedule page.

**I forgot my admin passphrase**  
→ Go to Render → your service → Environment → change the `ADMIN_PASSPHRASE` value → Save → Redeploy.

**An operator code isn't working**  
→ Go to Render → Environment → check `ACTIVITY_CODES` — make sure the code is in there, separated by commas, no spaces.

**Images aren't showing**  
→ Make sure the filename in the activity record exactly matches the filename in the `static/` folder (case-sensitive). The image must be committed to GitHub.

**I want to change the QR code destination**  
→ The QR codes in `tv.html` and `today.html` point to  
`https://ccbractivix.github.io/RGP/activities-web/index.html`  
If you ever move the site, update the `src` URL of the `<img>` tags in those two files.
