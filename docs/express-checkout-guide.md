# Express Check Out — Setup & Operations Guide

> **Service overview**  
> Express Check Out lets resort guests check out from their phone by scanning a QR code displayed on in-room TVs and common-area screens. Staff see submissions in real time via a protected operator dashboard. A separate TV display is provided for the housekeeping team. All records are automatically cleared at 4 pm ET each day, with a CSV archive written to the repository for safekeeping.

---

## Table of Contents

1. [First-time deployment](#1-first-time-deployment)  
2. [Environment variables](#2-environment-variables)  
3. [Frontend configuration (two edits required)](#3-frontend-configuration)  
4. [Adding the QR slide to the channel TV](#4-adding-the-qr-slide-to-the-channel-tv)  
5. [Daily operations — front desk / manager](#5-daily-operations)  
6. [Daily operations — housekeeping](#6-daily-operations--housekeeping)  
7. [Auto-refresh behaviour](#7-auto-refresh-behaviour)  
8. [How the daily clear works](#8-how-the-daily-clear-works)  
9. [Changing the access code](#9-changing-the-access-code)  
10. [Adding or removing villas](#10-adding-or-removing-villas)  
11. [Troubleshooting](#11-troubleshooting)  
12. [File map](#12-file-map)

---

## 1. First-time deployment

The backend is a standalone Node/Express service that lives in `checkout-backend/`. It is deployed separately from the theater backend.

### On Render

1. Log in to [render.com](https://render.com) and click **New → Web Service**.
2. Connect the `ccbractivix/RGP` repository.
3. Set the following:

   | Field | Value |
   |---|---|
   | **Root Directory** | `checkout-backend` |
   | **Build Command** | `npm install` |
   | **Start Command** | `npm start` |
   | **Environment** | `Node` |

4. Add the environment variables listed in [Section 2](#2-environment-variables).
5. Click **Create Web Service**. Note the URL Render assigns (e.g. `https://checkout-backend-xxxx.onrender.com`). You will need it in Step 3.

> **Database**: the service uses the same PostgreSQL connection string as the other Render services. It auto-creates the `checkouts` table on first start — no manual migration is required.

---

## 2. Environment variables

Set these in the Render dashboard under **Environment → Environment Variables**.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string (same DB as theater-backend). |
| `CHECKOUT_CODES` | ✅ | Comma-separated access codes for the operator dashboard, e.g. `4872` or `4872,5590`. 4-digit numeric codes are recommended. |
| `NODE_ENV` | ✅ | Set to `production`. Enables SSL on the DB connection. |
| `GITHUB_TOKEN` | Recommended | Personal access token (classic) with `repo` write scope. Used to push daily CSV exports to the repository. If omitted, the daily archive is skipped — records are still cleared at 4 pm. |
| `GITHUB_REPO` | Optional | Repository to push exports to. Defaults to `ccbractivix/RGP`. |
| `GITHUB_BRANCH` | Optional | Branch to push exports to. Defaults to `main`. |
| `CORS_ORIGIN` | Optional | Additional allowed CORS origins, comma-separated. `https://ccbractivix.github.io` is always allowed. |
| `PORT` | Optional | Server port. Render sets this automatically; defaults to `3005` locally. |

### Creating a GitHub token for CSV exports

1. Go to **GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)**.
2. Click **Generate new token (classic)**.
3. Give it a name like `RGP Checkout Exporter`.
4. Select the `repo` scope (full control of private repositories, or `public_repo` if the repo is public).
5. Set an expiration date, generate the token, and paste it into the `GITHUB_TOKEN` env var on Render.

---

## 3. Frontend configuration

After the Render service is deployed and you have its URL, two edits are needed in the source files.

### 3a. Update the API URL in all three web pages

All three pages in `checkout-web/` have this meta tag near the top:

```html
<meta name="api-url" content="https://checkout-backend.onrender.com">
```

Replace `https://checkout-backend.onrender.com` with your actual Render URL in all three files:

| File | Purpose |
|---|---|
| `checkout-web/index.html` | Guest check-out form |
| `checkout-web/operator.html` | Staff operator dashboard |
| `checkout-web/housekeeping.html` | Housekeeping TV display |

### 3b. Update the QR code target URL in the channel slide

Open `channel-web/checkout-slide.html` and find this block near the bottom of the `<script>` tag:

```js
const CHECKOUT_URL = params.get('url') ||
  'https://ccbractivix.github.io/RGP/checkout-web/';
```

Replace the fallback URL with the live GitHub Pages URL of the guest form. For this repository it is:

```
https://ccbractivix.github.io/RGP/checkout-web/
```

If the repository is public and GitHub Pages is enabled for the `main` branch, this URL is already correct and no change is needed.

---

## 4. Adding the QR slide to the channel TV

The QR slide is a standalone HTML file that works inside the Channel Player just like any other slide URL.

1. Open the Channel Manager admin interface.
2. Add a new slide with the URL:
   ```
   https://ccbractivix.github.io/RGP/channel-web/checkout-slide.html
   ```
3. Set the display duration to suit the playlist cadence (e.g. 20–30 seconds).
4. If you want to point the QR at a different URL without editing the file, append a `?url=` parameter:
   ```
   .../checkout-slide.html?url=https://your-custom-url.com
   ```

The slide shows a warm-orange background (matching the go4launch TV brand), the "Ready to check out?" headline, and a live-generated QR code.

---

## 5. Daily operations — front desk / manager

### Viewing check-outs

1. On any device, open:
   ```
   https://ccbractivix.github.io/RGP/checkout-web/operator.html
   ```
2. Enter the operator access code (set in `CHECKOUT_CODES`) and tap **Sign In**.
3. The dashboard shows a table with three columns: **Villa**, **Last Name**, and **Time** (Eastern).
4. A green **● Live** badge appears between 6 am and 10:30 am ET, during which the page refreshes automatically every minute. Outside those hours the badge reads **○ Standby** and the page is refreshed manually.

### Manually refreshing

Tap the **↺ Refresh** button at any time.

### Downloading a CSV of today's check-outs

Tap the **⬇ Export CSV** button. The file is named `checkouts-YYYY-MM-DD.csv` and contains three columns: `villa`, `last_name`, `submitted_at` (ISO 8601 UTC timestamp).

### What happens at 4 pm

At 4:00 pm ET the backend automatically:
1. Exports the day's records to `checkout-exports/YYYY-MM-DD.csv` in the GitHub repository (if `GITHUB_TOKEN` is set).
2. Deletes all rows from the database.

The operator dashboard will show zero records after the clear. This is expected.

---

## 6. Daily operations — housekeeping

The housekeeping display shows **villa numbers and check-out times only** — no guest last names.

1. Open a browser or TV browser to:
   ```
   https://ccbractivix.github.io/RGP/checkout-web/housekeeping.html
   ```
2. The list updates automatically every minute between 6 am and 10:30 am ET. A live indicator in the bottom-right corner shows whether auto-refresh is active.
3. Villa numbers are displayed in large type for easy reading from across the room.

---

## 7. Auto-refresh behaviour

Both the operator dashboard and the housekeeping display share the same refresh logic.

| Time (Eastern) | Behaviour |
|---|---|
| 6:00 am – 10:30 am | Page polls every **60 seconds**. Badge/indicator reads **Live**. |
| Outside those hours | No automatic polling. Badge/indicator reads **Standby**. Page can be refreshed manually. |

The refresh window is checked on a 60-second tick, so the transition in/out of the active window happens within one minute of the boundary.

---

## 8. How the daily clear works

The backend polls once every minute for the daily clear window. The clear fires when:
- The Eastern clock shows **4:00 pm or 4:01 pm** (a 2-minute window to survive slow server starts).
- That calendar date has not already been cleared during this server session.

**Process:**
1. All current checkout rows are fetched.
2. If there are any rows, a CSV is pushed to `checkout-exports/YYYY-MM-DD.csv` in the repository via the GitHub Contents API.
3. All rows are deleted from the database.

If the GitHub push fails for any reason (bad token, network error), the clear is retried on the next tick. If the deletion itself fails, the `_lastClearDate` guard is reset so the process will attempt again within the minute.

**Daily archive location in the repo:**
```
checkout-exports/
  2026-05-06.csv
  2026-05-07.csv
  ...
```

---

## 9. Changing the access code

Access codes are stored **only in the Render environment variable** — they are never committed to the repository.

1. Go to the checkout service on [render.com](https://render.com).
2. Open **Environment → Environment Variables**.
3. Edit the `CHECKOUT_CODES` value. Multiple codes can be separated by commas: `4872,5590`.
4. Click **Save Changes**. Render will redeploy the service automatically.

The new code is active within about 1–2 minutes (time for Render to restart).

---

## 10. Adding or removing villas

The authoritative villa list lives in two places that must always be kept in sync:

| File | Variable(s) |
|---|---|
| `checkout-backend/services/checkouts.js` | `B1_WHOLE`, `B1_AB`, `B2`, `B3` |
| `checkout-web/index.html` | Same arrays, duplicated in the inline `<script>` |

**Building 1 rules:**
- Rooms in `B1_WHOLE` are single undivided units. Guests select the room number only.
- Rooms in `B1_AB` may be occupied as Unit A, Unit B, or the combined A+B. Guests see an extra **A / B / A+B** selector after choosing their room number.

**Buildings 2 & 3:**
- All rooms are plain numeric units — no A/B sub-units.

After editing the arrays, commit and push. The backend re-validates on the next request; the frontend picks up changes on the next page load (no build step required).

---

## 11. Troubleshooting

### "Invalid or missing auth code" on the operator dashboard

- Confirm the code you typed matches what is in `CHECKOUT_CODES` on Render (exact digits, no spaces).
- Make sure the Render service is deployed and healthy (check the Render logs).

### The QR code shows but the guest form returns an error

- Verify the `api-url` meta tag in `checkout-web/index.html` points to the live Render URL (not the placeholder `https://checkout-backend.onrender.com`).
- Check the Render service logs for startup errors (usually a bad `DATABASE_URL`).

### "This villa may have already been checked out recently"

This is the **soft-duplicate warning** — the same villa submitted within the last 10 minutes. If a second guest is genuinely checking out:
- Tap **Submit** again. The second submission will go through with `force: true`.

### The daily clear didn't run / CSV is missing from the repo

1. Check Render logs around 4:00–4:01 pm ET for `[clear] Daily clear complete` or an error message.
2. If `GITHUB_TOKEN` is not set or has expired, the database clear still runs but the CSV is skipped. The log will show `[github] GITHUB_TOKEN not set — skipping CSV push`.
3. Generate a new token (see [Section 2](#2-environment-variables)) and update the Render environment variable.

### The housekeeping TV shows stale data

- Confirm the display is being loaded from GitHub Pages (not a cached local copy).
- Check the bottom-right indicator. If it reads **Standby**, refresh is paused outside the active window (6 am–10:30 am). Tap the screen to reload manually if needed.
- If the indicator reads **Live** but the data looks old, check whether the Render service is awake — free-tier Render services sleep after inactivity and can take ~30 seconds to cold-start on the first request.

### Render service sleeping on free tier

Free-tier Render services spin down after 15 minutes of inactivity. The first request after a sleep takes ~30 seconds. To avoid this during peak hours, upgrade to the Starter plan ($7/month) or use a free uptime monitor (e.g. [UptimeRobot](https://uptimerobot.com)) to ping `/health` every 5 minutes.

---

## 12. File map

```
checkout-backend/
  server.js                 Express app: CORS, rate-limiting, scheduled clear
  package.json              Node dependencies
  .gitignore
  db/
    db.js                   PostgreSQL pool
    schema.sql              Reference DDL (auto-applied at startup)
  routes/
    api.js                  POST /api/checkout
                            GET  /api/checkouts/housekeeping
    admin.js                POST /admin/verify
                            GET  /admin/checkouts  (auth required)
                            GET  /admin/export     (auth required)
  services/
    checkouts.js            Villa list, submit, dedup, clear, GitHub push

checkout-web/
  index.html                Guest check-out form (public)
  operator.html             Staff operator dashboard (access-code protected)
  housekeeping.html         Housekeeping TV display (public, names hidden)

channel-web/
  checkout-slide.html       Channel TV QR-code promotional slide

checkout-exports/           Created automatically by the daily clear
  YYYY-MM-DD.csv            One file per day (villa, last_name, submitted_at)

docs/
  express-checkout-guide.md  This document
  Hotel Room Export - Sheet1.csv  Source villa roster
```
