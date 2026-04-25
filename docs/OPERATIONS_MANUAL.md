# RGP — Operations & Setup Manual
### "For Dummies" Edition — Everything you need to run the resort display system

---

## Table of Contents

1. [What Is RGP?](#1-what-is-rgp)
2. [The Big Picture — How All the Pieces Fit Together](#2-the-big-picture)
3. [First-Time Setup (One Person, One Afternoon)](#3-first-time-setup)
   - [Step 1 — GitHub Pages (the websites)](#step-1--github-pages)
   - [Step 2 — Create the Databases (Render PostgreSQL)](#step-2--create-the-databases)
   - [Step 3 — Deploy the Backends (Render Web Services)](#step-3--deploy-the-backends)
   - [Step 4 — Set the Shared Access Code](#step-4--set-the-shared-access-code)
   - [Step 5 — First-Run Verification](#step-5--first-run-verification)
4. [Daily Operations — What Staff Actually Do](#4-daily-operations)
5. [Tool A — Channel Manager (TV Slideshow)](#5-tool-a--channel-manager)
6. [Tool B — Amenities Status Board](#6-tool-b--amenities-status-board)
7. [Tool C — Celebrations Slides](#7-tool-c--celebrations-slides)
8. [Tool D — Theater Showtimes](#8-tool-d--theater-showtimes)
9. [Tool E — Launch Tracker (Space Launches)](#9-tool-e--launch-tracker)
10. [Tool F — Disc Rentals Library](#10-tool-f--disc-rentals-library)
11. [Setting Up a TV](#11-setting-up-a-tv)
12. [Emergency Messaging (Breakthroughs)](#12-emergency-messaging)
13. [Lightning Alerts — How They Work Automatically](#13-lightning-alerts)
14. [Reference — All URLs at a Glance](#14-reference--all-urls)
15. [Reference — All Backend Environment Variables](#15-reference--all-backend-environment-variables)
16. [Troubleshooting](#16-troubleshooting)
17. [Glossary](#17-glossary)

---

## 1. What Is RGP?

RGP is a collection of tools that run the digital displays and guest-facing services at the resort. Everything is split into two kinds of files:

- **Front-end (websites)** — The HTML pages guests and staff actually see. These live on **GitHub Pages** (free, always-on web hosting). You don't need a server for these; GitHub hosts them automatically when you push code.

- **Back-end (servers)** — Small Node.js programs that store data in a database and answer questions from the front-end pages. These run on **Render** (a cloud hosting service). Each tool has its own backend server.

Think of it like a restaurant: the front-end is the dining room the guests see; the backend is the kitchen that actually stores the food and prepares orders.

---

## 2. The Big Picture

Here is how all the tools connect:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     GitHub Pages (static websites)                   │
│                                                                       │
│  channel-web/    amenities-web/   celebrations-web/   theater-web/   │
│  rentals-web/    go4launch/       splashpass/                         │
└──────────────────────────┬──────────────────────────────────────────┘
                           │  each page fetches live data via HTTPS
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Render (backend servers)                          │
│                                                                       │
│  channel-backend     amenities-backend    celebrations-backend        │
│  theater-backend     go4launch-backend    rentals-backend             │
└──────────────────────────┬──────────────────────────────────────────┘
                           │  each backend reads/writes its own database
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  Render PostgreSQL (databases)                        │
│   (you can use one shared database or separate ones per backend)     │
└─────────────────────────────────────────────────────────────────────┘
```

**What each tool does:**

| Tool | What It Shows | Who Uses It |
|------|--------------|-------------|
| **Channel Manager** | Rotating TV slideshow player + admin dashboard | Staff (admin), TVs (player) |
| **Amenities Status** | Pool/spa open-closed status + lightning alerts | TVs, guests on phone |
| **Celebrations** | Full-screen themed slides for birthdays, anniversaries, etc. | Staff (admin), TVs |
| **Theater Showtimes** | 7-day movie schedule with times | TVs, guests on phone |
| **Launch Tracker** | Upcoming space launches at KSC/Cape Canaveral | TVs, guests on phone |
| **Disc Rentals** | Guest-facing library + staff checkout system | Guests, front-desk staff |

---

## 3. First-Time Setup

> **You only do this once.** After setup, day-to-day operation requires no technical work.

### Step 1 — GitHub Pages

GitHub Pages automatically publishes every HTML file in this repository as a website. You just have to turn it on.

1. Go to **https://github.com/ccbractivix/RGP**
2. Click **Settings** (top menu of the repository page)
3. On the left sidebar, click **Pages**
4. Under **Source**, select **Deploy from a branch**
5. Set branch to **`main`** and folder to **`/ (root)`**
6. Click **Save**

After about 60 seconds, GitHub will show you a green banner with your site URL:
```
https://ccbractivix.github.io/RGP/
```

All the HTML pages in the repository are now live. For example:
```
https://ccbractivix.github.io/RGP/channel-web/admin.html
https://ccbractivix.github.io/RGP/amenities-web/admin.html
... and so on
```

> **Nothing to install, nothing to configure.** GitHub does all the work.

---

### Step 2 — Create the Databases

Each backend needs a PostgreSQL database. You can create them all in Render for free.

**Create one database per backend (or share one — see note below):**

1. Go to **https://render.com** and sign in (or create a free account)
2. Click **New → PostgreSQL**
3. Fill in:
   - **Name:** e.g., `channel-db` (use a descriptive name)
   - **Region:** Choose the one closest to Florida (US East)
   - **Plan:** Free
4. Click **Create Database**
5. Wait 1–2 minutes for it to provision
6. Click on the database, then copy the **External Database URL** — it looks like:
   ```
   postgres://user:password@hostname:5432/dbname
   ```
   Save this somewhere safe. You'll use it in Step 3.

**Repeat for each backend:**

| Backend | Suggested DB name |
|---------|------------------|
| `channel-backend` | `channel-db` |
| `amenities-backend` | `amenities-db` |
| `celebrations-backend` | `celebrations-db` |
| `theater-backend` | `theater-db` |
| `go4launch-backend` | `launch-db` |
| `rentals-backend` | `rentals-db` |

> **Can I use one database for everything?** Yes — you can create a single PostgreSQL instance and reuse the same connection string for all backends. Each backend creates its own tables with unique names, so they won't conflict. This is simpler and saves cost.

> **Do I need to create any tables?** No. Every backend creates its own tables automatically the first time it starts. You don't need to run any SQL.

---

### Step 3 — Deploy the Backends

For each backend, you create one "Web Service" on Render. Here are all six:

#### 3a. Channel Backend

| Setting | Value |
|---------|-------|
| **Repository** | `ccbractivix/RGP` |
| **Root Directory** | `channel-backend` |
| **Build Command** | `npm install` |
| **Start Command** | `node server.js` |
| **Plan** | Free |

**Environment variables to add:**

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Your PostgreSQL connection string |
| `CHANNEL_CODES` | One or more PIN codes, comma-separated (e.g., `1234,5678`) |
| `AMENITIES_API_URL` | `https://amenities-web.onrender.com/api/status` |
| `NODE_ENV` | `production` |

---

#### 3b. Amenities Backend

| Setting | Value |
|---------|-------|
| **Root Directory** | `amenities-backend` |
| **Build Command** | `npm install` |
| **Start Command** | `node server.js` |

**Environment variables:**

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Your PostgreSQL connection string |
| `AMENITY_CODES` | PIN codes for the amenities admin panel |
| `NODE_ENV` | `production` |

---

#### 3c. Celebrations Backend

| Setting | Value |
|---------|-------|
| **Root Directory** | `celebrations-backend` |
| **Build Command** | `npm install` |
| **Start Command** | `node server.js` |

**Environment variables:**

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Your PostgreSQL connection string |
| `CHANNEL_CODES` | **Same code(s) as channel-backend** — celebrations and channel manager share one code |
| `NODE_ENV` | `production` |

---

#### 3d. Theater Backend

| Setting | Value |
|---------|-------|
| **Root Directory** | `theater-backend` |
| **Build Command** | `npm install` |
| **Start Command** | `node server.js` |

**Environment variables:**

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Your PostgreSQL connection string |
| `ADMIN_PASSPHRASE` | Password for the theater admin panel |
| `SESSION_SECRET` | Any long random string (used to secure login sessions) |
| `NODE_ENV` | `production` |

---

#### 3e. Go4Launch Backend

| Setting | Value |
|---------|-------|
| **Root Directory** | `go4launch-backend` |
| **Build Command** | `npm install` |
| **Start Command** | `node server.js` |

**Environment variables:**

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Your PostgreSQL connection string |
| `ADMIN_CODES` | PIN codes for the launch admin panel |
| `NODE_ENV` | `production` |

---

#### 3f. Rentals Backend

| Setting | Value |
|---------|-------|
| **Root Directory** | `rentals-backend` |
| **Build Command** | `npm install` |
| **Start Command** | `node server.js` |

**Environment variables:**

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Your PostgreSQL connection string |
| `OMDB_API_KEY` | Your free API key from https://www.omdbapi.com — used for movie lookups |
| `ADMIN_CODES` | PIN codes for the library admin panel |
| `OPERATOR_CODES` | PIN codes for the front-desk staff panel |
| `NODE_ENV` | `production` |

---

#### How to add environment variables in Render

1. Open the service in Render
2. Click **Environment** in the left menu
3. Click **Add Environment Variable**
4. Enter the key and value
5. Click **Save Changes**
6. The service will automatically redeploy

---

### Step 4 — Set the Shared Access Code

The Channel Manager and Celebrations Manager share the same PIN code. Decide on your code(s) — they can be any numbers, any length (commonly 4–6 digits). Set the same value for `CHANNEL_CODES` in both `channel-backend` and `celebrations-backend`.

> **Example:** If you set `CHANNEL_CODES=4242` in both backends, the staff member types `4242` to log in to either admin page.

---

### Step 5 — First-Run Verification

After each backend deploys, verify it is healthy by opening its health-check URL in a browser:

| Backend | Health URL |
|---------|-----------|
| channel-backend | `https://channel-backend-uu2s.onrender.com/health` |
| amenities-backend | `https://amenities-web.onrender.com/health` |
| celebrations-backend | `https://celebrations-backend.onrender.com/health` |
| theater-backend | `https://theater-backend-qf1b.onrender.com/health` |
| go4launch-backend | `https://go4launch-backend.onrender.com/health` |
| rentals-backend | `https://rentals-backend.onrender.com/health` |

You should see: `{"status":"ok"}`

> **Replace the URLs above with your actual Render service URLs.** Each service gets a unique URL when you create it on Render.

---

## 4. Daily Operations — What Staff Actually Do

Once setup is complete, this is what your team will actually do day-to-day:

| Task | Who | Tool |
|------|-----|------|
| Add a celebration (birthday, anniversary, etc.) | Front desk | Celebrations Manager admin page |
| Remove an expired celebration | Front desk | Celebrations Manager admin page |
| Trigger a lightning closure | Amenities staff | Amenities admin page |
| Reopen amenities after lightning | Amenities staff | Amenities admin page (or automatic after timer) |
| Add/remove a slide from a TV channel | Manager | Channel Manager admin page |
| Push an emergency message to all TVs | Manager | Channel Manager → Breakthroughs tab |
| Update theater showtimes | Manager | Theater admin panel |
| Check out a rental disc to a guest | Front desk | Rentals operator panel |
| Check in a returned disc | Front desk | Rentals operator panel |
| Add a new movie/game to the rental library | Manager | Rentals admin panel |
| Check if TVs are online | Manager | Channel Manager → Monitor tab |

---

## 5. Tool A — Channel Manager

**What it does:** Manages which content plays on each TV and in what order. Think of it as your TV programming department.

### Admin page
```
https://ccbractivix.github.io/RGP/channel-web/admin.html
```

### What's on each tab

#### Channels tab
Shows all your TV "stations." Each card shows:
- The channel name (e.g., "Front Lobby")
- How many slides are in its playlist
- A green/red dot showing if that TV is online

**Click on a channel card** to open the editor for that channel.

#### Editing a channel
When you open a channel, you'll see:
1. **Channel Name** — what it's called
2. **Lightning Alert Rule** — toggle on/off; when on, this TV will automatically show a lightning banner when the amenities team triggers a closure
3. **Slide Playlist** — the list of slides currently in rotation for this TV

The slide editor has two sides:
- **Left — Available Slides:** all slides registered in your system (theater schedule, amenity status, launch tracker, celebration slides, etc.)
- **Right — Playlist:** the slides currently assigned to this channel, in order

To **add** a slide: click the **+** button on a slide in the Available column.
To **remove** a slide: click the **✕** button on a slide in the Playlist column.
To **reorder** slides: drag them up and down in the Playlist column.
To **change duration**: click the number next to a slide in the Playlist and type a new value (in seconds).

**Click Save Channel** when done.

#### Slides Library tab
Shows every slide URL registered in the system. You can add new slide URLs here (for example, a custom webpage you built, or a celebration slide URL from the Celebrations Manager). Click **+ Register Slide** and fill in the URL, a label, and optionally a description.

#### Breakthroughs tab
For emergency messages. See [Section 12](#12-emergency-messaging) for full details.

#### Monitor tab
Shows a live heartbeat from every TV player. Each TV sends a "I'm alive" signal every 30 seconds. You can see when each TV was last seen and whether it's currently online.

### The TV player
Each TV loads this URL in its browser:
```
https://ccbractivix.github.io/RGP/channel-web/player.html?channel=CHANNEL-ID
```
Replace `CHANNEL-ID` with the channel's ID (shown in the admin panel in gray below the name, e.g., `front-lobby`, `building-2`).

The player:
- Automatically loads its slide playlist from the backend
- Cycles through slides for the configured duration each
- Checks for updates and new breakthroughs every 30 seconds
- Shows a lightning banner at the top if lightning is active and the channel has the lightning rule enabled
- Requires no keyboard or mouse interaction — it just runs

---

## 6. Tool B — Amenities Status Board

**What it does:** Shows the open/closed status of pools, spas, and other amenities. Automatically handles lightning closures, maintenance windows, and scheduled hours.

### The pages

| Page | URL | Who uses it |
|------|-----|-------------|
| TV display | `.../amenities-web/tv.html` | TVs in the channel rotation |
| Guest mobile page | `.../amenities-web/index.html` | Guests on their phones |
| Splash Pass | `.../amenities-web/splashpass.html` | Quick guest status summary |
| Admin panel | `.../amenities-web/admin.html` | Amenities staff |

### Amenities that are tracked

- Main Pool, Main Spa
- Lazy River
- Water Slide
- Signature Pool, Signature Spa
- Guest Tram
- Mini Golf
- Sports Courts

Each has configured opening and closing times. Outside of those hours, they automatically show as **Outside Hours** (gray). During hours, they show **Open** (green). When closed for a reason, they show **Closed** (red).

### Closing an amenity (non-lightning)

1. Open the admin page and sign in
2. Find the amenity in the list
3. Click **Close** next to it
4. Choose a reason: **Closed**, **Wind**, **Maintenance**, or **Delay**
5. Choose a duration (15 min, 30 min, 1 hr, 2 hr, etc.)
6. Click **Confirm**

The amenity will show as closed on all displays. It will **automatically reopen** when the timer expires — you don't need to do anything else.

### Lightning closure

Lightning closures affect all water-related amenities at once (pools, spas, lazy river, water slide). When you trigger one:

1. In the admin panel, click **⚡ Trigger Lightning Closure**
2. Choose a duration (15 min minimum — required by safety policy)
3. Click **Confirm**

All water amenities will show as closed. A yellow lightning warning banner appears at the top of every display. When the timer expires, amenities automatically reopen (unless you extend or manually close them again).

The Channel Manager TVs that have the **Lightning Alert Rule** enabled will also show a banner across the top of their screen automatically.

---

## 7. Tool C — Celebrations Slides

**What it does:** Lets you create a beautiful full-screen themed slide for a guest's special occasion — a birthday, anniversary, new baby, graduation, or retirement. The slide is added to that building's TV channel and automatically expires at noon on the guest's checkout date.

### Celebration types available

| Type | Theme / Colors |
|------|---------------|
| 🎈 Birthday (Kids) | Bright rainbow (red/yellow/teal) |
| 🎂 Birthday (Adults) | Dark navy / champagne gold |
| 🌹 Birthday (Seniors) | Warm brown / cream |
| 💕 Anniversary | Purple / pink / rose |
| 🩷 Welcome Baby (Pink) | Soft pink / white |
| 💙 Welcome Baby (Blue) | Sky blue / white |
| 🎓 Congratulations Graduate | Forest green / cream |
| 🌟 Retirement | Gold / warm amber |

### How to create a celebration slide

1. Open the Celebrations Manager:
   ```
   https://ccbractivix.github.io/RGP/celebrations-web/admin.html
   ```

2. Enter your **access code** (same code as the Channel Manager)

3. On the **Create Celebration** tab, fill in the form:
   - **Celebration Type** — pick from the dropdown
   - **Name 1** *(required)* — the guest's first name (e.g., "Emma")
   - **Name 2** *(optional)* — a second name, for couples or partners (e.g., "Jack")
   - **Family Name** *(optional)* — shown below the names as a subtitle (e.g., "The Smiths")
   - **Building Number** *(required)* — which building the guest is in
   - **Check Out Date** *(required)* — the guest's checkout date (pick from the calendar). The slide will expire at **noon** on this date.
   - **Birthday Number** *(appears only for Kids type)* — the age they're celebrating (e.g., 8)
   - **Anniversary Number** *(appears only for Anniversary type)* — the year milestone (e.g., 25). The system automatically uses the special name: 25th = Silver, 50th = Golden, 60th = Diamond. All other years use the number (e.g., "Happy 12th Anniversary!")

4. Click **Create Celebration Slide**

5. A green box will appear with the **Slide URL**. Copy it using the **Copy URL** button.

6. Switch to the **Channel Manager admin** page, open the building's channel (e.g., "Building Two"), click **Register Slide** (or use the existing slide from the pool), paste the URL, and add it to the playlist.

> **Tip:** Use the **Preview** button on the Celebrations page to see exactly what the slide looks like on-screen before adding it to the TV.

### When a celebration expires

At noon on the guest's checkout date, the slide URL will still "work" but the slide was stored in the database and is no longer considered active. No automatic removal from the channel playlist happens — you should manually remove the celebration slide from the channel editor once the guest checks out. Use the **Manage Celebrations** tab in the Celebrations Manager to see what's expired and clean up.

### Manage Celebrations tab

Shows all celebrations ever created. You can:
- Filter by **Active** (still running) or **Expired** (past checkout)
- Filter by **type** or **building number**
- **Preview** any slide
- **Copy** the slide URL again
- **Delete** a record

---

## 8. Tool D — Theater Showtimes

**What it does:** Shows a 7-day movie schedule with showtimes, ratings, and promotions on TVs and on guests' phones.

### The pages

| Page | URL | Who uses it |
|------|-----|-------------|
| TV display | `.../theater-web/tv.html` | TVs in the channel rotation |
| Guest web page | `.../theater-web/index.html` | Guests browsing on their phone |
| Admin panel | `https://theater-backend-qf1b.onrender.com/admin-ui/` | Manager who manages the schedule |

> The theater admin panel is served directly from Render (not GitHub Pages) because it uses session-based login.

### How to update showtimes

1. Open the theater admin panel URL above
2. Log in with the theater admin passphrase
3. Use the **Schedule** section to add, edit, or remove showings
4. Each showing has: movie, date, time (Eastern), screen/auditorium, and promotion text
5. Changes appear on TVs and the guest page immediately

The TV display automatically refreshes and shows the current day's and next days' showings in a clean layout.

---

## 9. Tool E — Launch Tracker

**What it does:** Shows upcoming rocket launches from Kennedy Space Center and Cape Canaveral on the TVs. Data is pulled from a live launch database and updates automatically.

### The pages

| Page | URL | Who uses it |
|------|-----|-------------|
| TV display | `.../go4launch/tv.html` | TVs in the channel rotation |

No daily action required — the launch tracker updates itself.

---

## 10. Tool F — Disc Rentals Library

**What it does:** Manages a physical library of movie/game discs that guests can borrow.

### The three pages

| Page | URL | Who uses it |
|------|-----|-------------|
| Public library | `.../rentals-web/index.html` | Guests browsing on their phone |
| Operator panel | `.../rentals-web/operator.html` | Front-desk staff checking discs in/out |
| Admin panel | `.../rentals-web/admin.html` | Manager adding titles, managing library |

### Front desk — checking out a disc to a guest

1. Open the operator panel and sign in with your operator PIN
2. Find the title in the list (use the search box if needed)
3. Tap on it — a panel opens showing the available copies
4. Select a copy (x1, x2, etc.)
5. Enter the guest's **room number** and **last name**
6. Tap **Check Out Now**

For multiple discs in one transaction:
- Tap **Add to Session** instead of "Check Out Now"
- The session bar at the top of the screen shows the running list
- Add up to 3 titles
- Tap **Check Out** in the session bar to complete all at once

### Front desk — checking in a returned disc

1. Open the operator panel
2. Find the title (look for the red **Out** badge)
3. Tap on it — the panel shows which copies are out, with room and name
4. Tap **Check In** next to the right copy
5. If the disc is damaged: tap **Check In as Damaged** instead

### Manager — adding a movie

1. Open the admin panel and sign in
2. Go to the **Add Title** tab
3. Make sure **Movie** is selected
4. Type the movie title in the lookup box and click **Look Up**
5. The system fetches the movie info from the internet (title, year, rating, runtime, poster)
6. Click **Add to Library**

### Manager — adding a game

1. Add Title tab → select **Game**
2. Fill in the title, year, genres, and ESRB rating manually
3. Click **Add to Library**

---

## 11. Setting Up a TV

Every TV in the resort shows content through a web browser pointed at a specific URL. Here is exactly how to set up a TV from scratch:

### What you need
- A TV with a built-in browser, or a Chromecast/FireStick/smart device plugged into the TV
- The TV connected to the resort Wi-Fi
- The channel player URL for that location

### Steps

1. **Connect the TV to Wi-Fi** using the TV's network settings menu

2. **Open the browser** on the TV (built-in browser, or use a device like a Chromecast and cast a browser tab from a laptop)

3. **Navigate to the player URL** for that location:
   ```
   https://ccbractivix.github.io/RGP/channel-web/player.html?channel=CHANNEL-ID
   ```
   
   Replace `CHANNEL-ID` with one of these:
   
   | Location | Channel ID |
   |----------|-----------|
   | Front Lobby | `front-lobby` |
   | Building Two | `building-2` |
   | Building Three | `building-3` |
   | Restaurant | `restaurant` |
   | No Limits | `no-limits` |
   
   Example for Building Two:
   ```
   https://ccbractivix.github.io/RGP/channel-web/player.html?channel=building-2
   ```

4. **Put the browser in full-screen mode** (usually press F11, or use the browser's "full screen" option)

5. **Disable the screen saver** in the TV's settings so it doesn't go black after a few minutes

6. **That's it.** The player loads the channel's slide playlist and starts cycling automatically. It checks in with the server every 30 seconds, picks up any playlist changes you make in the admin panel, and shows emergency breakthroughs the moment they are activated.

### TV appears offline in the Monitor tab

If a TV shows as "Offline" in the Channel Manager's Monitor tab, it means the TV hasn't checked in within the last 2 minutes. Common causes:
- TV lost Wi-Fi connection
- Browser was closed or navigated away
- TV was turned off
- Render free-tier backend "spun down" (see Troubleshooting)

---

## 12. Emergency Messaging

**Breakthroughs** push a full-screen banner to every TV instantly. Use them for emergencies, urgent announcements, or safety notices.

### How to send a breakthrough

1. Open the Channel Manager admin page and sign in
2. Click the **Breakthroughs** tab
3. Click **+ New Breakthrough**
4. Fill in:
   - **Title** — the big, bold text (e.g., "POOL CLOSURE")
   - **Message** — the details below the title (e.g., "All pools are closed due to lightning. Please return indoors.")
   - **Background Color** — defaults to dark red. Change to any hex color.
   - **Text Color** — defaults to white.
   - **Target Channels** — leave all unchecked to send to EVERY channel, or check specific ones to target only those TVs
5. Click **Save**
6. You'll see the breakthrough card in the list. It is **not yet active**.
7. Click **Activate** on the card

The breakthrough will appear on the targeted TVs within **30 seconds** (the player checks every 30 seconds).

### How to stop a breakthrough

1. In the Breakthroughs tab, find the active card (it has a red border)
2. Click **Deactivate**

The banner disappears from TVs within 30 seconds.

### Tips

- You can have multiple breakthroughs saved, and activate/deactivate them as needed. This lets you prepare common messages in advance (e.g., "Pool area is closing in 30 minutes").
- To edit a breakthrough message, click the **Edit** (pencil) icon on its card.
- To permanently remove a breakthrough, click **Delete**.

---

## 13. Lightning Alerts — How They Work Automatically

When the amenities team triggers a lightning closure, the information flows automatically through the system:

1. Amenities staff presses the lightning button in the **Amenities admin panel**
2. The **amenities-backend** records the closure and marks the affected amenities as closed
3. The **channel-backend** polls the amenities-backend every **30 seconds** to check lightning status
4. If any amenity has lightning = active, the channel-backend considers lightning "active" for the whole property
5. Any TV channel with the **Lightning Alert Rule** enabled will show a yellow warning banner at the top of its screen on the next poll cycle (within 30 seconds)

No manual action is needed in the Channel Manager for lightning alerts — they happen automatically as long as the Lightning Alert Rule is enabled on a channel.

**To enable/disable the lightning rule on a channel:**
1. Open Channel Manager admin → click on the channel
2. Look for the **Lightning Alert Rule** dropdown
3. Set to **Enabled** or **Disabled**
4. Save the channel

---

## 14. Reference — All URLs

### Admin / Management Pages

| Tool | Admin URL |
|------|-----------|
| Channel Manager | `https://ccbractivix.github.io/RGP/channel-web/admin.html` |
| Amenities Admin | `https://ccbractivix.github.io/RGP/amenities-web/admin.html` |
| Celebrations Manager | `https://ccbractivix.github.io/RGP/celebrations-web/admin.html` |
| Theater Admin | `https://theater-backend-qf1b.onrender.com/admin-ui/` |
| Rentals Admin | `https://ccbractivix.github.io/RGP/rentals-web/admin.html` |
| Rentals Operator | `https://ccbractivix.github.io/RGP/rentals-web/operator.html` |

### TV / Display Pages (for plugging into TVs)

| Location / Content | URL |
|-------------------|-----|
| **Channel Player — Front Lobby** | `.../channel-web/player.html?channel=front-lobby` |
| **Channel Player — Building Two** | `.../channel-web/player.html?channel=building-2` |
| **Channel Player — Building Three** | `.../channel-web/player.html?channel=building-3` |
| **Channel Player — Restaurant** | `.../channel-web/player.html?channel=restaurant` |
| **Channel Player — No Limits** | `.../channel-web/player.html?channel=no-limits` |
| **Amenities Status (TV)** | `.../amenities-web/tv.html` |
| **Theater Showtimes (TV)** | `.../theater-web/tv.html` |
| **Launch Tracker (TV)** | `.../go4launch/tv.html` |

> All TV URLs start with `https://ccbractivix.github.io/RGP/` — abbreviated above as `...`

### Guest / Public Pages

| Page | URL |
|------|-----|
| Pool / Amenity Status | `.../amenities-web/index.html` |
| Splash Pass | `.../amenities-web/splashpass.html` |
| Theater Schedule | `.../theater-web/index.html` |
| Disc Rentals Library | `.../rentals-web/index.html` |

---

## 15. Reference — All Backend Environment Variables

### channel-backend (port 3003)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `CHANNEL_CODES` | ✅ | Comma-separated PIN codes for admin login |
| `AMENITIES_API_URL` | ✅ | URL of the amenities status API (for lightning polling) |
| `NODE_ENV` | ✅ | Set to `production` |
| `CORS_ORIGIN` | Optional | Extra allowed origins |

### amenities-backend (port 3001)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `AMENITY_CODES` | ✅ | Comma-separated PIN codes for admin login |
| `NODE_ENV` | ✅ | Set to `production` |

### celebrations-backend (port 3004)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `CHANNEL_CODES` | ✅ | Same PIN codes as channel-backend |
| `NODE_ENV` | ✅ | Set to `production` |

### theater-backend (port 3000)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `ADMIN_PASSPHRASE` | ✅ | Password for admin login |
| `SESSION_SECRET` | ✅ | Any long random string (e.g., 32+ random characters) |
| `NODE_ENV` | ✅ | Set to `production` |

### go4launch-backend (port 3002)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `ADMIN_CODES` | ✅ | Comma-separated PIN codes for admin login |
| `NODE_ENV` | ✅ | Set to `production` |

### rentals-backend (port 3002)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `OMDB_API_KEY` | ✅ | Free API key from https://www.omdbapi.com |
| `ADMIN_CODES` | ✅ | Comma-separated PIN codes for admin login |
| `OPERATOR_CODES` | ✅ | Comma-separated PIN codes for operator login |
| `NODE_ENV` | ✅ | Set to `production` |

---

## 16. Troubleshooting

### "The TV went black / stopped updating"

The player runs entirely in the browser. Common causes:
- **The browser was closed or navigated away.** Reopen it and go back to the player URL.
- **The TV's screensaver activated.** Disable the screensaver in the TV's settings.
- **The Render backend spun down.** The free Render tier spins down after 15 minutes of no traffic. The first request after a sleep wakes it up, but this takes 30–60 seconds. During this time the TV may show a blank white page or the last cached slide. It will recover on its own within a minute.

### "The admin page says 'Connection error' when I try to log in"

The backend is likely spun down (see above). Wait 30–60 seconds and try again. If it keeps happening:
1. Open the health-check URL for that backend in a browser (see [Section 5 verification](#step-5--first-run-verification))
2. If you see an error instead of `{"status":"ok"}`, check the Render logs for that service

### "I changed the playlist but the TV isn't showing the change"

The TV player checks for updates every 30 seconds. Wait up to 30 seconds and the change will appear. If it doesn't:
- Hard-refresh the TV browser (usually hold Ctrl/Cmd and press R, or go to the TV settings)
- Check that you clicked **Save Channel** in the admin panel

### "The lightning banner isn't showing on the TV"

1. Make sure the **Lightning Alert Rule** is set to **Enabled** on that channel (in Channel Manager admin → click the channel → check the dropdown)
2. Make sure the amenities team actually triggered a lightning closure (not just a manual close)
3. Wait up to 60 seconds — the channel backend polls every 30 seconds, and the TV polls every 30 seconds, so worst case is 60 seconds total delay

### "A celebration slide is still showing after the guest checked out"

Celebration slides don't automatically remove themselves from the channel playlist — they just expire in the database. You need to:
1. Open the Channel Manager, find the channel, click on it
2. Remove the celebration slide from the playlist
3. Click Save Channel

### "The celebrations admin page says 'Invalid access code'"

The Celebrations Manager uses the same `CHANNEL_CODES` value as the Channel Manager. Make sure you're entering the same code. If someone recently changed the code, update it in the `celebrations-backend` environment variables on Render and redeploy.

### "The Render service is crashing on startup"

1. In Render, open the failing service and click **Logs**
2. Look for the error message near the bottom
3. The most common cause is a missing or incorrect `DATABASE_URL` — double-check the environment variable
4. Another common cause: the database is sleeping. Wait a minute and redeploy.

### "I need to change the PIN code"

1. Go to Render → open the backend service
2. Click **Environment** in the sidebar
3. Edit the `CHANNEL_CODES` (or `ADMIN_CODES`, etc.) value
4. Click **Save Changes** — the service redeploys automatically
5. The new code will work within about 30 seconds (after the redeploy completes)

---

## 17. Glossary

| Term | What it means |
|------|--------------|
| **Backend** | The server-side program (running on Render) that stores data in a database and answers requests from web pages |
| **Channel** | A named TV station / playlist — e.g., "Front Lobby" or "Building Two" |
| **Breakthrough** | An emergency full-screen banner pushed to one or more TVs instantly |
| **Channel ID** | The short identifier used in the player URL (e.g., `front-lobby`, `building-3`) — lowercase with hyphens, no spaces |
| **GitHub Pages** | Free static web hosting provided by GitHub — all the HTML pages in this repo are served here automatically |
| **Heartbeat** | A "ping" the TV player sends to the backend every 30 seconds to say it's still running |
| **Lightning Rule** | A per-channel setting that, when enabled, automatically shows a weather banner whenever a lightning closure is active |
| **PIN / Access Code** | The numeric code used to log in to the admin pages — shared between Channel Manager and Celebrations Manager |
| **Player** | The full-screen TV slideshow page (`player.html`) |
| **Render** | The cloud hosting platform where all the backend servers run — https://render.com |
| **Slide** | A single web page displayed in the TV slideshow rotation (e.g., the amenity status page, a theater schedule, a celebration slide) |
| **Spin-down** | When a Render free-tier service goes to sleep after 15 minutes of inactivity. Wakes automatically on the next request (30–60 second delay). |

---

*End of RGP Operations & Setup Manual*

*For technical questions or to make system changes, refer to the GitHub repository: https://github.com/ccbractivix/RGP*
