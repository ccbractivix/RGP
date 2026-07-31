# RGP — User Manual

### The complete guide for resort staff, operators, and managers

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Channel Manager — TV Slideshows](#2-channel-manager)
3. [Amenities Status Board](#3-amenities-status-board)
4. [Celebrations Slides](#4-celebrations-slides)
5. [Theater Showtimes](#5-theater-showtimes)
6. [Activities Scheduler](#6-activities-scheduler)
7. [Express Check Out](#7-express-check-out)
8. [Disc Rentals Library](#8-disc-rentals-library)
9. [go4launch — Rocket Launch Tracker](#9-go4launch)
10. [Cabana Booking](#10-cabana-booking)
11. [Setting Up a TV](#11-setting-up-a-tv)
12. [Emergency Messaging & Lightning Alerts](#12-emergency-messaging--lightning-alerts)
13. [Quick Reference](#13-quick-reference)

---

## 1. Introduction

### What is RGP?

RGP (Resort Guest Platform) is the collection of tools that power the resort's digital displays, guest services, and staff dashboards. It covers everything from what plays on the lobby TV to how a guest checks out from their villa.

### Who is this manual for?

- **Operators** — front desk staff, lifeguards, activities team members who use the tools day-to-day
- **Admins / Managers** — team leaders who configure and manage the tools
- **IT / Setup** — anyone deploying or maintaining the system (see also the companion [How It Works](HOW_IT_WORKS.md) technical guide)

### How the tools connect

Every tool has two parts:

1. **A web page** (the part you see) — hosted automatically by GitHub Pages. These are the admin dashboards, guest pages, and TV displays.
2. **A backend server** (the brain) — hosted on Render.com. This stores data in a database and serves it to the web pages.

You interact with the web pages. The backend works silently in the background. You never need to touch it during normal operations.

### Access codes

Each tool is protected by a numeric PIN code (typically 4 digits). These codes are stored in Render environment variables — never in the code itself. To get or change a code, ask the person who manages the Render account or see [Section 13 — Quick Reference](#13-quick-reference).

---

## 2. Channel Manager

**What it does:** Controls which content plays on each resort TV and in what order. Think of it as the TV programming department.

**Admin page:** `https://ccbractivix.github.io/RGP/channel-web/admin.html`

**Access code:** Set in `CHANNEL_CODES` on Render

### Logging in

1. Open the admin page in any browser
2. Enter your 4-digit access code
3. Click **Sign In**

### The four tabs

#### Channels tab (main screen)

Shows a card for each TV "station." Each card displays:
- Channel name (e.g., "Front Lobby")
- Channel ID (e.g., `front-lobby`) — used in the TV player URL
- Slide count
- Online status — green dot = TV is running, red = offline for 2+ minutes

Click any card to edit it.

#### Editing a channel

When you open a channel, you see two panels:

- **Left — Available Slides:** all slide pages registered in the system
- **Right — Playlist:** the slides currently assigned to this channel, in order

| Action | How |
|--------|-----|
| Add a slide | Click **+** next to a slide in the Available column |
| Remove a slide | Click **✕** next to a slide in the Playlist column |
| Reorder slides | Drag slides up and down in the Playlist |
| Change duration | Click the number (seconds) next to a slide and type a new value |
| Lightning rule | Toggle the **Lightning Alert Rule** dropdown to Enabled/Disabled |

Click **Save Channel** when done.

#### Slides Library tab

Shows every slide URL registered in the system. To add a new slide:
1. Click **+ Register Slide**
2. Enter the URL, a label, and optionally a description
3. Click Save

#### Breakthroughs tab

For emergency messages — see [Section 12](#12-emergency-messaging--lightning-alerts).

#### Monitor tab

Shows a live heartbeat from every TV player. Each TV sends an "I'm alive" signal every 30 seconds. You can see:
- When each TV was last seen
- Whether it's currently online (green) or offline (red)

### Creating a new channel

1. Click **+ New Channel**
2. Enter a **Channel ID** (lowercase, hyphens, no spaces — e.g., `pool-area`)
3. Enter a **Display Name** (e.g., "Pool Area")
4. Add slides and set durations
5. Toggle Lightning Alert Rule if needed
6. Click **Save Channel**

---

## 3. Amenities Status Board

**What it does:** Shows the real-time open/closed status of pools, spas, and other amenities. Handles lightning closures, maintenance, and hours automatically.

**Admin page:** `https://ccbractivix.github.io/RGP/amenities-web/admin.html`

**Access code:** Set in `AMENITY_CODES` on Render

### The pages

| Page | URL | Audience |
|------|-----|----------|
| Admin panel | `.../amenities-web/admin.html` | Amenities staff |
| TV display | `.../amenities-web/tv.html` | TVs |
| Guest mobile | `.../amenities-web/index.html` | Guests on phone |
| Splash Pass | `.../amenities-web/splashpass.html` | Quick guest summary |
| Pools detail | `.../amenities-web/pools.html` | Guests |

### What's tracked

Main Pool, Main Spa, Lazy River, Water Slide, Signature Pool, Signature Spa, Guest Tram, Mini Golf, Sports Courts.

Each amenity has configured hours. Outside hours → **Outside Hours** (gray). During hours → **Open** (green). Closed → **Closed** (red).

### Closing an amenity (non-lightning)

1. Sign in to the admin page
2. Find the amenity
3. Click **Close**
4. Choose a reason: **Closed**, **Wind**, **Maintenance**, or **Delay**
5. Choose a duration: 15 min, 30 min, 1 hr, 90 min, or 2 hr
6. Click **Confirm**

The amenity shows as closed on all displays and **automatically reopens** when the timer expires.

To extend a closure by 15 minutes, click **Update Now** on the amenity while it is closed.

### Lightning closure

Lightning closures affect **all water-related amenities at once** (pools, spas, lazy river, water slide).

1. In the admin panel, click **⚡ Trigger Lightning Closure**
2. Choose a duration (15 min minimum — required by safety policy)
3. Click **Confirm**

All water amenities close. A yellow lightning warning banner appears on every display. When the timer expires, amenities automatically reopen.

To clear a lightning closure early: click **Clear Lightning** in the admin panel.

> **Automatic TV alerts:** TVs with the Lightning Alert Rule enabled in the Channel Manager will also show a banner automatically — no extra action needed.

---

## 4. Celebrations Slides

**What it does:** Creates beautiful full-screen themed slides for guest occasions — birthdays, anniversaries, new babies, graduations, and retirements. The slide plays on the guest's building TV.

**Admin page:** `https://ccbractivix.github.io/RGP/celebrations-web/admin.html`

**Access code:** Same as Channel Manager (`CHANNEL_CODES`)

### Available celebration types

| Type | Theme |
|------|-------|
| 🎈 Birthday (Kids) | Bright rainbow |
| 🎂 Birthday (Adults) | Dark navy / champagne gold |
| 🌹 Birthday (Seniors) | Warm brown / cream |
| 💕 Anniversary | Purple / pink / rose |
| 🩷 Welcome Baby (Pink) | Soft pink / white |
| 💙 Welcome Baby (Blue) | Sky blue / white |
| 🎓 Congratulations Graduate | Forest green / cream |
| 🌟 Retirement | Gold / warm amber |

### Creating a celebration slide

1. Open the Celebrations admin page and sign in
2. On the **Create Celebration** tab, fill in:
   - **Celebration Type** — pick from dropdown
   - **Name 1** *(required)* — guest's first name
   - **Name 2** *(optional)* — second name (for couples)
   - **Family Name** *(optional)* — shown as subtitle
   - **Building Number** *(required)* — which building
   - **Check Out Date** *(required)* — slide expires at noon on this date
   - **Birthday Number** *(Kids only)* — age
   - **Anniversary Number** *(Anniversary only)* — year milestone (25 = Silver, 50 = Golden, 60 = Diamond)
3. Click **Create Celebration Slide**
4. Copy the **Slide URL** using the **Copy URL** button
5. Open the **Channel Manager**, find the building's channel, and add the slide to the playlist

> **Tip:** Click **Preview** to see exactly how the slide looks before adding it to the TV.

### Managing celebrations

Use the **Manage Celebrations** tab to:
- Filter by Active / Expired / type / building
- Preview any slide
- Copy the slide URL
- Delete a celebration

### When a celebration expires

The slide expires at noon on the checkout date. It doesn't auto-remove from the TV playlist — you should manually remove it from the Channel Manager.

---

## 5. Theater Showtimes

**What it does:** Manages a 7-day movie schedule with showtimes, ratings, and posters. Shows on TVs and on guests' phones.

**Admin page:** `https://theater-backend-qf1b.onrender.com/admin-ui/` *(served from Render, not GitHub Pages)*

**Access:** Log in with the theater admin passphrase (set in `ADMIN_PASSPHRASE` on Render)

### Display pages

| Page | URL | Audience |
|------|-----|----------|
| TV display | `.../theater-web/tv.html` | TVs |
| Guest schedule | `.../theater-web/index.html` | Guests on phone |
| Today only | `.../theater-web/today.html` | Quick reference |
| Next showing | `.../theater-web/next.html` | Quick reference |

### Managing the movie library

1. Log in to the admin panel
2. Click **📚 Library** in the top menu
3. To add a movie:
   - Click **+ Add Movie**
   - Search by title or IMDB ID — the system fetches poster, rating, runtime automatically from TMDB
   - Click **Add to Library**
4. To edit/delete a movie, click on it in the library list

### Building the schedule

1. From the admin panel, click **📅 Schedule**
2. Select a date
3. Click **+ Add Showing**
4. Pick a movie from the library, set the time
5. Click **Save**

Changes appear on TVs and guest pages immediately. The TV display refreshes automatically.

### Theater closures

If the theater needs to close (maintenance, private event, etc.):
1. In the admin panel, find the **Closure** option
2. Set the closure dates and an expected reopen message
3. Guest pages will show the closure notice instead of showtimes

---

## 6. Activities Scheduler

**What it does:** Manages the resort activities schedule — from pool games to crafts. Shows on TVs and guests' phones. Staff can cancel or relocate activities in real time.

**Schedule Builder (admin):** `https://your-activities-backend.onrender.com/admin-ui/` *(served from Render)*

**Access:** Log in with the admin passphrase (set in `ADMIN_PASSPHRASE` on Render)

**Operator tool (cancel/relocate):** `https://ccbractivix.github.io/RGP/activities-web/admin.html`

**Operator access code:** Set in `ACTIVITY_CODES` on Render

### Display pages

| Page | URL | Audience |
|------|-----|----------|
| Guest schedule (7 days) | `.../activities-web/index.html` | Guests on phone |
| 4-day TV display | `.../activities-web/tv.html` | TVs |
| Today-only TV | `.../activities-web/today.html` | TVs |

### Building the activity library

Before you can schedule activities, create them in the library:

1. Log in to the admin panel → click **📚 Library**
2. Click **＋ Add Activity**
3. Fill in:
   - **Activity ID** — unique code like `ACT-WATERSLIDE` (must start with `ACT-`)
   - **Activity Name** — what guests see (e.g., "Water Slide Races")
   - **Venue** — pick from dropdown
   - **Duration** — minutes
   - **Price** — leave blank if free
   - **Additional Info Lines** — optional notes (e.g., "Ages 7 and up")
   - **Image Filename** — optional, must match a file in the `static/` folder
   - **⭐ Featured** — check to show in the featured panel at the top of displays
4. Click **Add Activity**

### Building the weekly schedule

1. From admin, click **📅 Schedule**
2. Click a day column to select it
3. Click **＋ Add Activity**, select from dropdown, set the start time
4. Click **Add**, then **💾 Save Day** when the day looks right

**Copy Last Week:** Click **📋 Copy Last Week** to duplicate the previous week's schedule.

### Cancel or relocate (Schedule Builder)

In the day editor:
- **⛔** — Cancel the activity (guests see red strikethrough text)
- **📍** — Relocate to a different venue (guests see the new venue in red)
- **↩** — Restore a canceled or relocated activity

### Cancel or relocate (Operator Tool — activities-web/admin.html)

This simpler tool is for activities staff in the moment:

1. Open the operator page and enter your code
2. Tap any of today's activities
3. Choose **⛔ Cancel** or **📍 Relocate** (pick a venue or type a custom location)
4. Tap **↩ Restore** to undo

Changes go live on all displays on the next refresh.

### What guests see

- **Guest schedule (index.html):** 7-day view, today first. Featured activities in the top panel. Canceled activities in red strikethrough. Relocated activities show the new venue in red.
- **TV displays:** Auto-refresh every 5 minutes. QR code links to the full guest schedule.

---

## 7. Express Check Out

**What it does:** Lets guests check out from their phone by scanning a QR code on the TV. Staff see submissions in real time.

**Operator dashboard:** `https://ccbractivix.github.io/RGP/checkout-web/operator.html`

**Access code:** Set in `CHECKOUT_CODES` on Render

### Display pages

| Page | URL | Audience |
|------|-----|----------|
| Guest check-out form | `.../checkout-web/index.html` | Guests (via QR code) |
| Staff operator dashboard | `.../checkout-web/operator.html` | Front desk |
| Housekeeping display | `.../checkout-web/housekeeping.html` | Housekeeping team |
| QR slide for TVs | `.../channel-web/checkout-slide.html` | TVs |

### For front desk staff

1. Open the operator dashboard and enter your access code
2. The dashboard shows a table: **Villa**, **Last Name**, **Time** (Eastern)
3. A green **● Live** badge appears between 6 AM and 10:30 AM ET — the page refreshes automatically every minute
4. Outside those hours the badge reads **○ Standby** — refresh manually with the **↺ Refresh** button
5. To download today's submissions: click **⬇ Export CSV**

### For housekeeping

The housekeeping display at `.../checkout-web/housekeeping.html` shows **villa numbers and check-out times only** — no guest names. Updates automatically every minute during the live window (6 AM – 10:30 AM ET). Villa numbers are shown in large type for easy reading from across the room.

### What happens at 4 PM

Every day at 4:00 PM ET, the backend automatically:
1. Exports the day's records to `checkout-exports/YYYY-MM-DD.csv` in the GitHub repo (if configured)
2. Deletes all rows from the database

The dashboard shows zero records after the clear. This is expected — tomorrow's submissions start fresh.

### Duplicate check-out warning

If the same villa submits within 10 minutes, a warning appears: "This villa may have already been checked out recently." The guest can tap **Submit** again to proceed.

---

## 8. Disc Rentals Library

**What it does:** A checkout system for physical movie and game discs that guests can borrow from the front desk.

### The three pages

| Page | URL | Audience |
|------|-----|----------|
| Public library | `.../rentals-web/index.html` | Guests |
| Operator panel | `.../rentals-web/operator.html` | Front desk (PIN: `OPERATOR_CODES`) |
| Admin panel | `.../rentals-web/admin.html` | Managers (PIN: `ADMIN_CODES`) |

### For guests — browsing and reserving

1. Open the public library page — no login needed
2. Browse by **All**, **Movies**, or **Games**; sort by Title, Year, or Genre
3. Search by typing any part of a title or genre
4. Status labels:
   - 🟢 **Available** — on the shelf
   - 🔴 **Out** — all copies checked out
   - 🟡 **Reserved** — reserved by another guest
5. To reserve: tap **Reserve** → enter Room Number + Last Name → tap **Reserve**
   - Reservations are held for **24 hours**, then expire automatically
   - Maximum **3 active reservations** per guest

### For front desk — checking out discs

1. Open the operator panel and sign in with your PIN
2. Find the title (search or browse, filter by Available/Out/Reserved/Movies/Games)
3. Tap a title with a green **Available** badge
4. Select a copy (x1, x2, etc.), enter guest's **Room Number** and **Last Name**
5. Tap **Check Out Now**

**Multiple discs (up to 3):**
- Tap **Add to Session** instead of Check Out Now
- Add more titles
- Tap **Check Out** in the session bar to complete all at once

### For front desk — checking in discs

1. Find the title (red **Out** badge) and tap it
2. See which copies are out with room and name
3. Tap **Check In** next to the correct copy
4. If damaged: tap **Check In as Damaged** instead

### For managers — admin panel

| Tab | What you do |
|-----|-------------|
| **Add Title** | Add a movie (auto-lookup from OMDB) or game (manual entry) |
| **Library** | View all titles, add copies (**+ Add Copy**), delete titles |
| **Checked Out** | See all currently checked-out discs with room + name |
| **Damaged** | See all damaged discs, remove from library |

---

## 9. go4launch

**What it does:** The resort's rocket launch companion app. Shows upcoming launches from KSC and Cape Canaveral with countdowns, custom content, a blog, and photo galleries.

**Admin dashboard:** `https://go4launch-backend.onrender.com/admin-ui/`

**Access code:** Set in `GO4LAUNCH_CODES` (or `ADMIN_CODES`) on Render

### Display pages

| Page | URL | Audience |
|------|-----|----------|
| Guest launch app | `.../go4launch/index.html` | Guests on phone |
| TV display | `.../go4launch/tv.html` | TVs |

### For guests

The app has three tabs:
- 🚀 **Launches** — upcoming launch cards with countdowns
- 📷 **Galleries** — launch photo galleries
- 📝 **Blog** — Chris' Blog posts

A **NEW** badge appears on tabs with content added in the past 7 days.

### Managing launch content (admin dashboard)

1. Open the admin dashboard and enter your code
2. Select a launch from the upcoming list
3. Add custom content:
   - **Headline** — short summary for the card
   - **Viewing Guide** — tips for watching from the resort
   - **Chris Says** — personal commentary
   - **Trajectory** — flight path info
   - **Images** — upload custom launch images

Launch data comes from Launch Library 2 automatically. Custom content is an overlay you can add.

### Managing the blog

1. From the admin dashboard, click **📝 Blog Editor**
2. Click **+ New Post**
3. Fill in:
   - **Title** *(required)*
   - **Slug** *(auto-generated)* — the URL identifier
   - **Excerpt** — 1–2 sentence preview
   - **Post Body** *(required)* — supports basic HTML (`<b>`, `<i>`, `<br>`, `<a>`)
   - **Header Image URL** — optional banner image
   - **Tags** — comma-separated keywords
   - **📚 Add to Chris' Library** — check for evergreen "must read" posts (keep to 5–10)
   - **✅ Published** — check to make live; leave unchecked for draft
4. Click **💾 Save Post**

To take a post offline: uncheck **✅ Published** and save. To delete: scroll to the red **🗑 Delete** button.

### Managing photo galleries

Galleries are stored in `go4launch/data/galleries.json`. To add one:

1. Go to [github.com/ccbractivix/RGP](https://github.com/ccbractivix/RGP)
2. Navigate to `go4launch` → `data` → `galleries.json`
3. Click the pencil icon ✏️ to edit
4. Add a new entry:
   ```json
   {
     "id": "falcon9-starlink-jan-2025",
     "title": "Falcon 9 — Starlink Jan 15 2025",
     "date": "2025-01-15",
     "url": "https://sites.google.com/view/your-gallery",
     "cover": "https://link-to-thumbnail.jpg",
     "description": "A stunning nighttime launch.",
     "featured": true
   }
   ```
5. Commit the change — the app updates within 1–3 minutes

Set `featured: true` for 1–3 galleries max to show as large banners at the top.

### Upkeep — launch data feed health (LL2 API)

Launch data comes from a third-party service called **Launch Library 2** (run by TheSpaceDevs). go4launch is "pinned" to a specific version of their feed. Once or twice a year that service can change or retire a version — when that happens, launch cards can quietly stop updating.

To catch this early, the backend runs an **automatic health check** every day (7:00 AM Eastern) and again each time it restarts. **You don't have to do anything to run it** — it runs on its own.

**How you'll be notified:** if you set `LL2_ALERT_EMAIL` on Render to your email address, the system will email you (using the same SendGrid account that sends the gallery emails) whenever the feed looks broken or a newer version is available. No alert email means nothing needs attention. You can also open `https://go4launch-backend.onrender.com/api/ll2-status` any time to see the latest check result.

**If you get an alert email:** the launch feed needs a small code update (pointing go4launch at the new feed version). Forward the alert to whoever maintains the code — it's a quick change, not a guest-facing emergency. Existing launch cards keep showing their last-known data in the meantime.

**To turn email alerts on (one-time, on Render):**
1. In the `go4launch-backend` service, open **Environment**
2. Add `LL2_ALERT_EMAIL` = your email address (comma-separate multiple addresses)
3. Make sure `SENDGRID_API_KEY` and `SENDGRID_FROM` are already set (they power the existing emails)
4. Save — Render redeploys automatically

---

## 10. Cabana Booking

**What it does:** Manages poolside cabana reservations. Operators book cabanas for guests; admins handle configuration, holds, and review.

**Operator page:** `https://ccbractivix.github.io/RGP/cabana-web/operator.html`

**Admin page:** `https://ccbractivix.github.io/RGP/cabana-web/admin.html`

**Access codes:** `CABANA_OPERATOR_CODES` (operators) and `CABANA_ADMIN_CODES` (admins) on Render

### Key rules

- **One booking per cabana per day** (full day or half day)
- **Half-day split at 2:00 PM** — AM checkout is 1:00 PM, PM session starts at 2:00 PM
- **All times are Eastern US**
- **No public interface** — only operators and admins can access
- **Contact phone number required** for every booking
- Bookings **more than 21 days** in advance require admin review

### For operators — booking a cabana

1. Open the operator page and enter your code
2. Use the calendar to find the date
3. See available cabanas and their status
4. Click on an available slot to create a booking
5. Fill in guest details: name, contact phone, booking type (full day, AM half, PM half)
6. Submit the booking

### For operators — cancellations

1. Find the booking in the calendar
2. Click to open it
3. Click **Cancel**
4. Check the box for **Refund Issued** or **CC/RC Hold Released** as applicable
5. Confirm

Operators can view cancellation history.

### For admins

Admins can do everything operators can, plus:
- **Edit bookings** (admin-only capability)
- **Review bookings** made more than 21 days in advance
- **Set manager holds** with three types:
  - **Total Blocked** — cabana unavailable for any use
  - **Blocked for [Guest]** — held for a specific guest
  - **Available, No Payment** — bookable but don't accept payment
- **Customize cabana names** — default is "Cabana No. N" but admin can rename
- **Run reports** using the custom date range picker

### Reserve locks

A "reserved but unconfirmed" status persists **indefinitely** until cleared by an operator or admin.

---

## 11. Setting Up a TV

Every resort TV shows content through a web browser pointed at a specific URL.

### What you need

- A TV with a built-in browser (or a Chromecast/Fire Stick/smart device)
- TV connected to the resort Wi-Fi
- The channel player URL for that location

### Steps

1. **Connect the TV to Wi-Fi**
2. **Open the browser** on the TV
3. **Navigate to the player URL:**
   ```
   https://ccbractivix.github.io/RGP/channel-web/player.html?channel=CHANNEL-ID
   ```
   Replace `CHANNEL-ID` with the channel ID (shown in Channel Manager admin):

   | Location | Channel ID |
   |----------|-----------|
   | Front Lobby | `front-lobby` |
   | Building Two | `building-2` |
   | Building Three | `building-3` |
   | Restaurant | `restaurant` |
   | No Limits | `no-limits` |

4. **Put the browser in full-screen mode** (usually F11)
5. **Disable the screen saver** so the screen doesn't go black

That's it. The player loads the playlist and cycles automatically. It checks for updates every 30 seconds and shows breakthroughs instantly.

### TV appears offline

If a TV shows as "Offline" in the Channel Manager Monitor tab (no check-in for 2+ minutes):
- TV lost Wi-Fi
- Browser was closed or navigated away
- TV was turned off
- Render backend "spun down" (free tier — wakes up within 30–60 seconds)

---

## 12. Emergency Messaging & Lightning Alerts

### Breakthroughs (emergency messages)

Breakthroughs push a full-screen banner to every TV instantly. Use for emergencies, urgent announcements, or safety notices.

#### Sending a breakthrough

1. Open Channel Manager admin → **Breakthroughs** tab
2. Click **+ New Breakthrough**
3. Fill in:
   - **Title** — bold headline (e.g., "POOL CLOSURE")
   - **Message** — details below the title
   - **Background Color** — defaults to dark red
   - **Text Color** — defaults to white
   - **Target Channels** — leave unchecked for ALL TVs, or select specific channels
4. Click **Save** (the breakthrough is saved but **not yet active**)
5. Click **Activate** on the card

The breakthrough appears on targeted TVs within **30 seconds**.

#### Stopping a breakthrough

Click **Deactivate** on the active card. Banner disappears within 30 seconds.

#### Tips

- Save common messages in advance (e.g., "Pool area closing in 30 minutes") and activate/deactivate as needed
- Edit with the pencil icon; delete permanently with Delete

### Lightning alerts (automatic)

When the amenities team triggers a lightning closure, alerts flow automatically:

1. Staff presses the lightning button in the **Amenities admin**
2. The **amenities-backend** records the closure
3. The **channel-backend** polls amenities every **30 seconds**
4. TVs with the **Lightning Alert Rule** enabled show a yellow warning banner

**No manual action is needed in the Channel Manager.** To enable/disable the rule:
1. Channel Manager admin → click a channel
2. Set **Lightning Alert Rule** to Enabled or Disabled
3. Save

Worst-case delay: 60 seconds (30 s backend poll + 30 s TV poll).

---

## 13. Quick Reference

### All admin URLs

| Tool | Admin / Operator URL |
|------|---------------------|
| Channel Manager | `https://ccbractivix.github.io/RGP/channel-web/admin.html` |
| Amenities Status | `https://ccbractivix.github.io/RGP/amenities-web/admin.html` |
| Celebrations | `https://ccbractivix.github.io/RGP/celebrations-web/admin.html` |
| Theater Showtimes | `https://theater-backend-qf1b.onrender.com/admin-ui/` |
| Activities (Schedule Builder) | `https://your-activities-backend.onrender.com/admin-ui/` |
| Activities (Operator) | `https://ccbractivix.github.io/RGP/activities-web/admin.html` |
| Express Check Out (Operator) | `https://ccbractivix.github.io/RGP/checkout-web/operator.html` |
| Disc Rentals (Operator) | `https://ccbractivix.github.io/RGP/rentals-web/operator.html` |
| Disc Rentals (Admin) | `https://ccbractivix.github.io/RGP/rentals-web/admin.html` |
| go4launch Admin | `https://go4launch-backend.onrender.com/admin-ui/` |
| go4launch Blog Editor | `https://go4launch-backend.onrender.com/admin-ui/blog.html` |
| Cabana Booking (Operator) | `https://ccbractivix.github.io/RGP/cabana-web/operator.html` |
| Cabana Booking (Admin) | `https://ccbractivix.github.io/RGP/cabana-web/admin.html` |

### All guest / public URLs

| Page | URL |
|------|-----|
| Amenity Status (mobile) | `.../amenities-web/index.html` |
| Splash Pass | `.../amenities-web/splashpass.html` |
| Theater Schedule | `.../theater-web/index.html` |
| Activities Schedule | `.../activities-web/index.html` |
| Disc Rentals Library | `.../rentals-web/index.html` |
| go4launch App | `.../go4launch/index.html` |

> All URLs starting with `...` expand to `https://ccbractivix.github.io/RGP/`

### All TV display URLs

| Content | URL |
|---------|-----|
| Channel Player | `.../channel-web/player.html?channel=CHANNEL-ID` |
| Amenities Status | `.../amenities-web/tv.html` |
| Theater Showtimes | `.../theater-web/tv.html` |
| Activities (4-day) | `.../activities-web/tv.html` |
| Activities (today) | `.../activities-web/today.html` |
| go4launch | `.../go4launch/tv.html` |
| Weather | `.../weather-web/tv.html` |
| Express Checkout QR | `.../channel-web/checkout-slide.html` |
| Housekeeping | `.../checkout-web/housekeeping.html` |

### Where access codes are stored

All access codes are stored as environment variables on Render — never in the code.

| Tool | Render env variable |
|------|-------------------|
| Channel Manager | `CHANNEL_CODES` |
| Celebrations | `CHANNEL_CODES` (shared with Channel Manager) |
| Amenities | `AMENITY_CODES` |
| Theater | `ADMIN_PASSPHRASE` |
| Activities (admin) | `ADMIN_PASSPHRASE` |
| Activities (operator) | `ACTIVITY_CODES` |
| Express Check Out | `CHECKOUT_CODES` |
| Disc Rentals (operator) | `OPERATOR_CODES` |
| Disc Rentals (admin) | `ADMIN_CODES` |
| go4launch | `GO4LAUNCH_CODES` / `ADMIN_CODES` |
| Cabana (operator) | `CABANA_OPERATOR_CODES` |
| Cabana (admin) | `CABANA_ADMIN_CODES` |

To change a code: Render → open the service → Environment → edit the variable → Save. The service redeploys automatically (~30 seconds).

### Daily checklist

| Time | Task | Tool | Who |
|------|------|------|-----|
| Morning | Check TV monitors are online | Channel Manager → Monitor tab | Manager |
| Morning | Review guest check-outs | Checkout Operator dashboard | Front desk |
| As needed | Close/reopen amenities | Amenities admin | Amenities staff |
| As needed | Trigger/clear lightning closure | Amenities admin | Amenities staff |
| As needed | Cancel/relocate activities | Activities operator tool | Activities staff |
| As needed | Check out/in rental discs | Rentals operator panel | Front desk |
| As needed | Create celebration slides | Celebrations admin | Front desk |
| As needed | Book/cancel cabanas | Cabana operator page | Front desk |
| Weekly | Build next week's activity schedule | Activities Schedule Builder | Manager |
| Weekly | Update theater showtimes | Theater admin panel | Manager |
| After checkout | Remove expired celebration slides | Channel Manager | Front desk |

### Troubleshooting quick fixes

| Problem | Fix |
|---------|-----|
| Admin page says "Connection error" | Backend is asleep (free Render tier). Wait 30–60 seconds and retry. |
| TV went black or stopped updating | Reopen browser, navigate back to player URL. Disable screensaver. |
| Playlist change not showing on TV | Wait 30 seconds (TV polls every 30s). Hard-refresh if needed. |
| Lightning banner not showing | Check Lightning Alert Rule is Enabled on that channel. |
| Celebration still showing after checkout | Manually remove the slide from the Channel Manager playlist. |
| "Invalid access code" | Confirm code matches the Render env variable. Check with manager. |
| Render service crashing | Check Render logs. Most common: bad `DATABASE_URL`. |

---

### Related documents

- **[How It Works — Technical Reference](HOW_IT_WORKS.md)** — Architecture, data flow, and developer guide
- **[Operations & Setup Manual](OPERATIONS_MANUAL.md)** — First-time deployment walkthrough
- **[Express Checkout Guide](express-checkout-guide.md)** — Detailed checkout system setup
- **[go4launch Blog & Galleries Guide](go4launch-blog-galleries-guide.md)** — Detailed blog/gallery instructions

---

*RGP — Resort Guest Platform*
