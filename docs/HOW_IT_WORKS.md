# RGP — How It Works

### Technical reference for developers and IT staff

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Service Map](#2-service-map)
3. [Data Flow](#3-data-flow)
4. [Authentication](#4-authentication)
5. [Database](#5-database)
6. [Hosting & Deployment](#6-hosting--deployment)
7. [Scheduling & Background Jobs](#7-scheduling--background-jobs)
8. [External Integrations](#8-external-integrations)
9. [Channel System Deep Dive](#9-channel-system-deep-dive)
10. [Theater Engine](#10-theater-engine)
11. [File & Folder Map](#11-file--folder-map)
12. [Adding a New Service](#12-adding-a-new-service)

---

## 1. Architecture Overview

RGP is a modular resort platform built as a collection of independent micro-services. Each service has a frontend and a backend that communicate over HTTPS.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    GitHub Pages (static HTML/JS/CSS)                     │
│                                                                         │
│  channel-web/     amenities-web/    celebrations-web/    theater-web/   │
│  activities-web/  checkout-web/     rentals-web/         go4launch/     │
│  cabana-web/      weather-web/      splashpass/                         │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │  HTTPS fetch / XHR
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Render Web Services (Node.js / Express)               │
│                                                                         │
│  channel-backend    amenities-backend     celebrations-backend          │
│  theater-backend    activities-backend    checkout-backend               │
│  rentals-backend    go4launch-backend     cabana-backend                │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │  pg (node-postgres)
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    PostgreSQL (Render managed or external)               │
│                                                                         │
│  One shared database or separate instances per service                  │
│  Tables are auto-created on first startup — no manual migrations        │
└─────────────────────────────────────────────────────────────────────────┘
```

### Design principles

- **No build step.** Frontends are vanilla HTML/CSS/JS served as static files. No webpack, no React, no transpilation.
- **Each service is independent.** Services don't share code or databases (with two exceptions: celebrations shares `CHANNEL_CODES` with channel-backend, and channel-backend polls amenities-backend for lightning status).
- **Auto-schema.** Every backend creates its own tables on startup. Drop a database and restart — it rebuilds itself.
- **Convention over configuration.** All frontends read their backend URL from a `<meta name="api-url">` tag, making it trivial to point at a different backend.

---

## 2. Service Map

| Service | Folder | Port | Purpose | Auth Pattern |
|---------|--------|------|---------|-------------|
| **Channel Manager** | `channel-backend/` + `channel-web/` | 3003 | TV slideshow playlists, breakthroughs, lightning alerts, TV monitoring | PIN (X-Auth-Code) |
| **Amenities** | `amenities-backend/` + `amenities-web/` | 3001 | Pool/spa status, lightning closures, hours management | PIN (X-Auth-Code) |
| **Celebrations** | `celebrations-backend/` + `celebrations-web/` | 3004 | Guest occasion slides (birthdays, anniversaries, etc.) | PIN (X-Auth-Code, shares CHANNEL_CODES) |
| **Theater** | `theater-backend/` + `theater-web/` | 3000 | 7-day movie schedule, library, closures | Session + CSRF |
| **Activities** | `activities-backend/` + `activities-web/` | 3006 | Activity schedule, library, cancel/relocate | Session + CSRF (admin), PIN (operator) |
| **Express Checkout** | `checkout-backend/` + `checkout-web/` | 3005 | Guest checkout form, operator dashboard, housekeeping | PIN (X-Auth-Code) |
| **Disc Rentals** | `rentals-backend/` + `rentals-web/` | 3002 | Movie/game library, checkout/checkin, reservations | PIN (operator + admin codes) |
| **go4launch** | `go4launch-backend/` + `go4launch/` | 3002 | Rocket launch tracker, blog, galleries | PIN (X-Auth-Code) |
| **Cabana Booking** | `cabana-backend/` + `cabana-web/` | 3007 | Poolside cabana reservations | Session + CSRF |

> **Note:** go4launch-backend and rentals-backend both default to port 3002 locally; on Render they are separate services with separate URLs.

### Static-only frontends (no backend)

| Folder | Purpose |
|--------|---------|
| `weather-web/` | TV weather display (NWS API, no backend needed) |
| `splashpass/` | Quick guest info pages (theater, launches) |
| `static/` | Shared image assets (activity photos, etc.) |

---

## 3. Data Flow

### Frontend → Backend communication

Every frontend reads its backend URL from a `<meta>` tag:

```html
<meta name="api-url" content="https://your-backend.onrender.com">
```

JavaScript in the page reads this tag and uses `fetch()` to call the backend API. There is no build step or bundler — everything is vanilla JS.

### Public endpoints (no auth)

All `/api/*` routes are public. TVs, guest phones, and anyone with the URL can read this data:

```
GET /api/status          → amenity open/closed state
GET /api/schedule        → movie or activity schedule
GET /api/channels/:id    → channel playlist for a TV player
GET /api/launches        → upcoming rocket launches
GET /api/celebrations    → active celebration slides
GET /api/titles          → rental library catalog
```

### Admin endpoints (auth required)

All `/admin/*` routes require authentication (see [Section 4](#4-authentication)):

```
POST /admin/verify       → validate an access code (returns 200 or 401)
GET  /admin/...          → read admin data
POST /admin/...          → create/update records
DELETE /admin/...        → delete records
```

### CORS

Every backend allows `https://ccbractivix.github.io` by default (the GitHub Pages origin). Additional origins can be added via the `CORS_ORIGIN` environment variable (comma-separated).

```javascript
// Typical CORS setup (every backend)
const allowedOrigins = ['https://ccbractivix.github.io'];
if (process.env.CORS_ORIGIN) {
  allowedOrigins.push(...process.env.CORS_ORIGIN.split(',').map(s => s.trim()));
}
app.use(cors({ origin: allowedOrigins, credentials: true }));
```

### Rate limiting

All backends use `express-rate-limit`:

| Endpoint type | Limit |
|---------------|-------|
| Public `/api/*` | 120 requests / minute |
| Admin `/admin/*` | 60 requests / 15 minutes |
| Login `/admin/verify` | 10 attempts / 15 minutes |

---

## 4. Authentication

Two patterns are used across the platform:

### Pattern A: PIN code via header (most services)

Used by: channel, amenities, celebrations, checkout, rentals, go4launch

```
Client sends:  X-Auth-Code: 1234
Server checks: validCodes.includes(req.headers['x-auth-code'])
Returns:        200 (valid) or 401 (invalid)
```

The valid codes are read from an environment variable at startup (e.g., `CHANNEL_CODES`, `AMENITY_CODES`). Multiple codes are comma-separated.

Frontend flow:
1. User enters PIN on login screen
2. Frontend calls `POST /admin/verify` with `X-Auth-Code` header
3. If 200, the PIN is stored in `sessionStorage` and sent with every subsequent request
4. If 401, login is rejected

### Pattern B: Session-based with CSRF (theater, activities, cabana)

Used by: theater-backend, activities-backend, cabana-backend

```
1. POST /admin/login  { passphrase: "..." }
   → Server creates an express-session (stored in PostgreSQL via connect-pg-simple)
   → Returns a session cookie

2. GET /admin/csrf-token
   → Returns a CSRF token tied to the session

3. All subsequent POST/PUT/DELETE requests must include:
   - The session cookie (automatic)
   - X-CSRF-Token header with the CSRF token
```

The passphrase is read from `ADMIN_PASSPHRASE` env var. Sessions are stored in PostgreSQL using `connect-pg-simple`. Theater-backend uses `crypto.timingSafeEqual` for constant-time comparison.

### Where codes are configured

| Env variable | Services | Type |
|-------------|----------|------|
| `CHANNEL_CODES` | channel-backend, celebrations-backend | PIN |
| `AMENITY_CODES` | amenities-backend | PIN |
| `CHECKOUT_CODES` | checkout-backend | PIN |
| `OPERATOR_CODES` | rentals-backend (operators) | PIN |
| `ADMIN_CODES` | rentals-backend (admins), go4launch-backend | PIN |
| `GO4LAUNCH_CODES` | go4launch-backend (alt name) | PIN |
| `ACTIVITY_CODES` | activities-backend (operator cancel/relocate) | PIN |
| `CABANA_OPERATOR_CODES` | cabana-backend (operators) | PIN |
| `CABANA_ADMIN_CODES` | cabana-backend (admins) | PIN |
| `ADMIN_PASSPHRASE` | theater-backend, activities-backend | Session |
| `SESSION_SECRET` | theater-backend, activities-backend, cabana-backend | Session encryption |

---

## 5. Database

### Auto-migration

Every backend creates its own tables on first startup. The pattern is:

```javascript
// In server.js or a db/init.js module
pool.query(`
  CREATE TABLE IF NOT EXISTS tablename (
    id SERIAL PRIMARY KEY,
    ...
  )
`);
```

There are no migration files or version tracking. To reset a service, drop its tables and restart — they'll be recreated.

### Shared vs. separate databases

You can run all services against **one PostgreSQL instance** or use **separate databases per service**. Each service uses unique table names, so there are no conflicts when sharing.

### Tables by service

#### channel-backend
| Table | Purpose |
|-------|---------|
| `channels` | Named playlists (id, name, slug) |
| `available_slides` | Registered slide URLs with labels |
| `channel_slides` | Slides assigned to a channel (ordering, duration) |
| `breakthroughs` | Emergency messages (title, body, colors, active flag, target channels) |
| `channel_rules` | Per-channel rules (e.g., lightning alert enabled) |
| `heartbeats` | TV player check-ins (channel, user-agent, last-seen timestamp) |

#### amenities-backend
| Table | Purpose |
|-------|---------|
| `amenities` | Status per amenity (open/closed, closure reason, lightning flag, hours, reopen timer) |

#### celebrations-backend
| Table | Purpose |
|-------|---------|
| `celebrations` | Celebration records (type, names, building, checkout date) |

#### theater-backend
| Table | Purpose |
|-------|---------|
| `library` | Movie catalog (title, MPAA rating, runtime, poster URL, IMDB ID) |
| `schedule` | Showtimes (date, start_time, movie reference) |
| `settings` | Key-value configuration pairs |
| `theater_closures` | Closure periods with reopen message |
| `session` | Express session store (auto-created by connect-pg-simple) |

#### activities-backend
| Table | Purpose |
|-------|---------|
| `activities_library` | Activity templates (name, venue, duration, price, featured flag) |
| `activities_schedule` | Scheduled instances (date, time, status: scheduled/canceled/relocated) |

#### checkout-backend
| Table | Purpose |
|-------|---------|
| `checkouts` | Guest submissions (villa, last_name, submitted_at) |

#### rentals-backend
| Table | Purpose |
|-------|---------|
| `rental_titles` | Master catalog (movies/games with IMDB/ESRB metadata) |
| `rental_copies` | Physical copies (copy_label: x1, x2, etc.) |
| `rental_checkouts` | Checkout records (room, name, timestamps) |
| `rental_reservations` | Guest reservations (24-hour auto-expiry) |
| `rental_collections` | Curated title groups |
| `rental_collection_titles` | Collection ↔ title junction table |

#### go4launch-backend
| Table | Purpose |
|-------|---------|
| `go4launch_content` | Custom launch content (headline, viewing guide, trajectory, images) |
| `go4launch_archive` | Historical launch data (JSONB) |
| `go4launch_saw_it` | "I Saw It" email tracking |
| `blog_posts` | Blog entries (title, slug, body, excerpt, tags, published flag, library flag) |

#### cabana-backend
| Table | Purpose |
|-------|---------|
| `cabanas` | Cabana definitions (name, status) |
| `cabana_bookings` | Reservation records (date, slot, guest info, status) |

---

## 6. Hosting & Deployment

### Frontend: GitHub Pages

All static HTML/CSS/JS files are served from GitHub Pages. The site deploys automatically when code is pushed to the `main` branch.

- **URL pattern:** `https://ccbractivix.github.io/RGP/<folder>/<file>.html`
- **Config:** Repository Settings → Pages → Deploy from `main` branch, root folder
- **No build step required.** Files are served as-is.

### Backend: Render Web Services

Each backend runs as a separate Render Web Service (Node.js).

| Setting | Value |
|---------|-------|
| Repository | `ccbractivix/RGP` |
| Root Directory | `<service>-backend` (e.g., `channel-backend`) |
| Build Command | `npm install` |
| Start Command | `node server.js` (or `npm start`) |
| Plan | Free or Starter |

Render auto-redeploys when code is pushed. Free-tier services spin down after 15 minutes of inactivity and take 30–60 seconds to cold-start.

### Environment variables reference

Every backend needs at minimum:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `NODE_ENV` | ✅ | Set to `production` (enables SSL on DB connections) |
| `CORS_ORIGIN` | Optional | Additional allowed CORS origins (comma-separated) |
| `PORT` | Optional | Server port (each service has its own default) |

Plus service-specific auth variables — see [Section 4](#4-authentication) for the complete list.

### Database: PostgreSQL

Render provides managed PostgreSQL. Tables are auto-created on first startup. Connection is over SSL in production (`NODE_ENV=production`).

---

## 7. Scheduling & Background Jobs

### Amenities — auto-reopen timer

- **Interval:** Every 30 seconds
- **Logic:** Checks if any amenity's closure timer has expired; if so, reopens it
- **File:** `amenities-backend/server.js`

### Channel — lightning status polling

- **Interval:** Every 30 seconds
- **Logic:** Polls `AMENITIES_API_URL` (`/api/status`) to check if any amenity has `lightning: true`. Caches the result and serves it to TV players.
- **File:** `channel-backend/server.js`

### Checkout — daily clear

- **Window:** 4:00–4:01 PM ET (2-minute window to survive slow starts)
- **Logic:**
  1. Exports all checkout rows to `checkout-exports/YYYY-MM-DD.csv` via GitHub Contents API
  2. Deletes all rows from the database
  3. A `_lastClearDate` guard prevents double-clearing
- **File:** `checkout-backend/services/checkouts.js`

### Rentals — reservation expiry

- **Interval:** Checked on each request (lazy evaluation)
- **Logic:** Reservations older than 24 hours are automatically expired

### Theater — nightly refresh

- **Interval:** Midnight ET (cron-based)
- **Logic:** Refreshes poster data from TMDB, cleans up past schedule entries

### Auto-refresh on frontends

| Page | Refresh interval | Active window |
|------|-----------------|---------------|
| Channel player (TVs) | 30 seconds | Always |
| Amenities TV/guest | 30–60 seconds | Always |
| Checkout operator/housekeeping | 60 seconds | 6 AM – 10:30 AM ET |
| Activities TV | 5 minutes | Always |

---

## 8. External Integrations

### NWS Weather API (weather-web)

- **Endpoint:** `https://api.weather.gov/points/{lat},{lon}` → resolves gridpoint → fetches forecast
- **Coordinates:** 28.404919, -80.597154 (Cape Canaveral area)
- **Refresh:** Every 60 minutes
- **Auth:** None (free public API)
- **File:** `weather-web/tv.html`

### WeatherBigfoot — Wind/Lightning/Rain TV (weather-web)

- **Wind & rain data:** `https://api.weather.gov/points/{lat},{lon}` → `forecastGridData` (same coordinates as above)
  - **Refresh:** Every 15 minutes
  - **Auth:** None (free public API)
- **Lightning data:** Blitzortung.org community network, streamed live over a public WebSocket
  (`wss://ws1.blitzortung.org/`, with `ws7`/`ws8` as fallback hosts)
  - Free, open, non-commercial community feed — no API key or registration; the same feed
    powers public sites such as lightningmaps.org
  - Frames are LZW-compressed JSON and are decoded client-side; strikes are filtered to those
    within ~120 miles of the resort and plotted on a simple radial distance chart (nearest
    strike distance + rolling 30-minute strike count)
  - Reconnects automatically with backoff if the socket drops
- **File:** `weather-web/weatherbigfoot.html`

### Launch Library 2 (go4launch)

- **Endpoint:** `https://ll.thespacedevs.com/2.2.0/launch/upcoming/`
- **Filter:** `location__ids=12,27` (KSC and Cape Canaveral)
- **Cache:** 5-minute in-memory TTL in go4launch-backend
- **Auth:** Optional `LL2_API_KEY` env var (higher rate limits with key)
- **File:** `go4launch-backend/routes/api.js`

### OMDB API (rentals)

- **Endpoint:** `https://www.omdbapi.com/?apikey=KEY&t=TITLE`
- **Purpose:** Auto-fills movie metadata (title, year, rating, runtime, poster, genres, IMDB link)
- **Auth:** `OMDB_API_KEY` env var (free tier: 1,000 requests/day)
- **File:** `rentals-backend/routes/admin.js`

### TMDB (theater)

- **Purpose:** Fetches movie posters and metadata for the theater schedule
- **File:** `theater-backend/` (integrated into library management)

### SendGrid (go4launch)

- **Purpose:** Sends "I Saw It" gallery notification emails to guests
- **Auth:** `SENDGRID_API_KEY` + `SENDGRID_FROM` env vars
- **File:** `go4launch-backend/routes/admin.js`

### GitHub Contents API (checkout)

- **Purpose:** Pushes daily CSV export to `checkout-exports/` in the repository
- **Auth:** `GITHUB_TOKEN` env var (PAT with `repo` scope)
- **File:** `checkout-backend/services/checkouts.js`

---

## 9. Channel System Deep Dive

The Channel Manager is the central orchestration layer for all TV displays. Here is how data flows from admin to screen.

### Architecture

```
Admin (admin.html)
  │
  ├─ POST /admin/channels      → Create/edit channels
  ├─ PUT  /admin/channels/:id/slides → Set playlist
  ├─ POST /admin/breakthroughs  → Create emergency messages
  └─ GET  /admin/heartbeats     → Monitor TV status
  │
  ▼
Channel Backend (Render)
  │
  ├─ Stores channels, slides, breakthroughs, rules, heartbeats in PostgreSQL
  ├─ Polls amenities-backend /api/status every 30s for lightning status
  │
  ▼
Player (player.html?channel=CHANNEL-ID)
  │
  ├─ GET /api/channels/:id      → Loads playlist (slide URLs + durations)
  ├─ GET /api/channels/:id/alerts → Checks for breakthroughs + lightning
  ├─ POST /api/channels/:id/heartbeat → Sends "I'm alive" ping
  │
  ├─ Renders slides in hidden iframes
  ├─ Crossfades between iframes on a timer
  ├─ Overlays breakthrough banner when active
  └─ Shows lightning warning bar when active + rule enabled
```

### Slide lifecycle

1. **Register:** Admin adds a slide URL to the Slides Library (any valid URL works — theater schedule page, amenity status page, a custom HTML page, etc.)
2. **Assign:** Admin adds the slide to a channel's playlist with a display duration (in seconds)
3. **Play:** The TV player loads the playlist, creates hidden iframes for each slide URL, and crossfades between them on the configured timer
4. **Update:** Every 30 seconds, the player re-fetches the playlist. If slides were added, removed, or reordered, the player adjusts in real time — no manual refresh needed
5. **Remove:** Admin removes the slide from the playlist. On the next 30-second poll, the player drops it

### Breakthrough flow

1. Admin creates a breakthrough (title, message, colors, optional target channels)
2. Admin activates the breakthrough
3. TV player polls `/api/channels/:id/alerts` every 30 seconds
4. If an active breakthrough targets this channel (or targets all), the player renders a full-screen banner overlay
5. Admin deactivates → next poll cycle removes the banner

### Lightning alert flow

1. Amenities staff triggers lightning closure in amenities-backend
2. Channel-backend polls `AMENITIES_API_URL` every 30 seconds
3. Channel-backend detects `lightning: true` in the response
4. TV player polls `/api/channels/:id/alerts`
5. If the channel has the Lightning Alert Rule enabled, the player shows a yellow warning banner
6. When amenities staff clears the closure, the banner disappears on the next cycle

### Heartbeat monitoring

Each TV player sends a `POST /api/channels/:id/heartbeat` every 30 seconds with its channel ID and user-agent. The admin Monitor tab queries `GET /admin/heartbeats` and shows each TV's last-seen timestamp and online/offline status (offline = no ping for 2+ minutes).

---

## 10. Theater Engine

The Theater Engine is a Python-based media controller that runs on a Mac Mini M4 connected to the theater projector/display.

### How it works

```
theater-backend (/api/schedule)
        │
        │  HTTP poll every 5 minutes
        ▼
Theater Engine (Python + MPV)
        │
        ├─ Caches schedule locally for offline resilience
        ├─ Maps movie titles to files: tt{imdbId}.OriginalFilename.mp4
        ├─ Controls MPV media player (play, stop, seek)
        ├─ Supports custom end times with fade-to-black
        └─ Manages trailers: trailer.{MovieTitle}.mp4
              │
              └─ Auto-generates chyron: "See It On Tuesday at 2:30 PM!"
                 (looks up next scheduled showing of that title)
```

### Key details

- **Schedule source:** Polls `theater-backend /api/schedule` every 5 minutes
- **Offline resilience:** Caches last-known schedule locally; continues operating if backend is unreachable
- **File naming:** `tt{imdbId}.OriginalFilename.mp4` (e.g., `tt0111161.TheShawshankRedemption.mp4`)
- **Trailer naming:** `trailer.{MovieTitle}.mp4`
- **Trailer chyron:** Automatically observes the next scheduled showing of the movie and displays a chyron like "See It On Tuesday at 2:30 PM!"
- **Custom end times:** Supports early end with fade-to-black
- **Library management:** Maintains a local file library exportable to CSV (title + last played date)
- **Lightning alerts:** Polls `channel-backend /api/channels/:id/alerts`; on lightning = dark screen (projector off)
- **Web dashboard:** Accessible from anywhere — shows today's status and allows sending chyron messages
- **Legacy:** The `Theater-Engine/` directory (capital T) contains an old Google Apps Script-based schedule page, superseded by `theater-web/`

---

## 11. File & Folder Map

```
RGP/
│
├── channel-backend/          Channel Manager backend (Express, port 3003)
│   ├── server.js             App entry, CORS, rate limiting, lightning polling
│   ├── routes/api.js         Public API: channels, alerts, heartbeats
│   ├── routes/admin.js       Admin API: channels, slides, breakthroughs, rules
│   └── db/                   Database pool + schema
│
├── channel-web/              Channel Manager frontend
│   ├── admin.html            Admin dashboard
│   ├── player.html           TV slideshow player
│   ├── slide.html            Individual slide display
│   ├── checkout-slide.html   Express Checkout QR code slide
│   └── USER_MANUAL.md        Detailed Channel Manager docs
│
├── amenities-backend/        Amenities Status backend (Express, port 3001)
│   ├── server.js             App entry, auto-reopen timer (30s interval)
│   └── routes/               api.js (public), admin.js (auth required)
│
├── amenities-web/            Amenities frontend
│   ├── admin.html            Staff control panel
│   ├── tv.html               TV display
│   ├── index.html            Guest mobile page
│   ├── pools.html            Pools detail page
│   └── splashpass.html       Quick status summary
│
├── celebrations-backend/     Celebrations backend (Express, port 3004)
│   ├── server.js             App entry
│   └── routes/               api.js, admin.js
│
├── celebrations-web/         Celebrations frontend
│   ├── admin.html            Create/manage celebrations
│   └── slide.html            Full-screen celebration display
│
├── theater-backend/          Theater Showtimes backend (Express, port 3000)
│   ├── server.js             App entry, session auth, CSRF, nightly cron
│   ├── routes/               api.js, admin.js
│   ├── admin-ui/             Login, dashboard, library (served same-origin)
│   └── db/                   Database pool + schema
│
├── theater-web/              Theater frontend
│   ├── index.html            Guest 7-day schedule
│   ├── tv.html               TV display
│   ├── today.html            Today's showtimes
│   └── next.html             Next showing
│
├── activities-backend/       Activities backend (Express, port 3006)
│   ├── server.js             App entry, session auth, CSRF
│   ├── routes/               api.js, admin.js
│   └── admin-ui/             Login, dashboard, library
│
├── activities-web/           Activities frontend
│   ├── index.html            Guest 7-day schedule
│   ├── tv.html               4-day TV display
│   ├── today.html            Today-only TV
│   ├── admin.html            Operator cancel/relocate tool
│   └── SETUP_GUIDE.md        Setup & usage guide
│
├── checkout-backend/         Express Checkout backend (Express, port 3005)
│   ├── server.js             App entry, daily 4PM clear
│   ├── routes/               api.js, admin.js
│   └── services/checkouts.js Villa list, submit, dedup, GitHub CSV push
│
├── checkout-web/             Checkout frontend
│   ├── index.html            Guest check-out form
│   ├── operator.html         Staff operator dashboard
│   └── housekeeping.html     Housekeeping TV display
│
├── checkout-exports/         Auto-generated daily CSV archives
│
├── rentals-backend/          Disc Rentals backend (Express, port 3002)
│   ├── server.js             App entry
│   └── routes/               api.js, admin.js, operator.js
│
├── rentals-web/              Rentals frontend
│   ├── index.html            Guest library browser
│   ├── operator.html         Front-desk checkout/checkin
│   └── admin.html            Manager library admin
│
├── rentals-docs/             Rentals documentation
│   ├── USERS_MANUAL.md       User's manual (guest, operator, admin)
│   └── INSTALL.md            Installation guide
│
├── go4launch-backend/        Launch Tracker backend (Express, port 3002)
│   ├── server.js             App entry, LL2 cache
│   ├── routes/               api.js (launches, blog, archive), admin.js
│   └── admin-ui/             Admin dashboard, blog editor
│
├── go4launch/                Launch Tracker frontend
│   ├── index.html            Guest launch app
│   ├── tv.html               TV display
│   ├── js/app.js             Main application logic (SPA with hash routing)
│   └── data/galleries.json   Static gallery data
│
├── cabana-backend/           Cabana Booking backend (Express, port 3007)
│   ├── server.js             App entry, session auth, CSRF
│   └── routes/               operator.js, admin.js
│
├── cabana-web/               Cabana frontend
│   ├── operator.html         Staff booking calendar
│   └── admin.html            Admin management
│
├── weather-web/              Weather display (static only)
│   └── tv.html               TV weather (NWS API, no backend)
│
├── splashpass/               Guest info pages (static only)
│   ├── theater.html          Theater quick info
│   └── launches.html         Launches quick info
│
├── static/                   Shared image assets
│   └── images/               Activity photos, logos, etc.
│
├── Theater-Engine/           Legacy theater (Google Apps Script, superseded)
├── launch-tracker/           Legacy launch UI v1
├── launch-tracker-2/         Legacy launch UI v2
├── launch-tracker-3/         Legacy launch UI v3
├── launch-tracker-lite/      Lightweight launch display
├── live-event-art/           Event/entertainment display assets
├── mockups/                  UI mockups and design files
│
├── docs/                     Documentation
│   ├── USER_MANUAL.md        Staff user manual (this companion doc)
│   ├── HOW_IT_WORKS.md       This document
│   ├── OPERATIONS_MANUAL.md  First-time setup & operations guide
│   ├── express-checkout-guide.md  Detailed checkout setup
│   └── go4launch-blog-galleries-guide.md  Blog & galleries guide
│
└── README.md                 Repository overview
```

---

## 12. Adding a New Service

Follow this pattern to add a new backend + frontend pair to RGP.

### 1. Create the backend

```
my-service-backend/
├── server.js          Express app (CORS, rate limiting, auto-schema)
├── package.json       Dependencies (express, pg, cors, express-rate-limit)
├── .gitignore         node_modules
├── db/
│   └── db.js          PostgreSQL pool (reads DATABASE_URL)
└── routes/
    ├── api.js         Public endpoints (GET /api/...)
    └── admin.js       Admin endpoints (POST/PUT/DELETE /admin/...)
```

#### server.js template

```javascript
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const pool = require('./db/db');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 30XX;

// CORS
const allowedOrigins = ['https://ccbractivix.github.io'];
if (process.env.CORS_ORIGIN) {
  allowedOrigins.push(...process.env.CORS_ORIGIN.split(',').map(s => s.trim()));
}
app.use(cors({ origin: allowedOrigins, credentials: true }));

// Rate limiting
app.use('/api', rateLimit({ windowMs: 60000, max: 120 }));
app.use('/admin', rateLimit({ windowMs: 900000, max: 60 }));

app.use(express.json());

// Routes
app.use('/api', apiRoutes);
app.use('/admin', adminRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Auto-create tables
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS my_table (
      id SERIAL PRIMARY KEY,
      ...
    )
  `);
}

initDB().then(() => {
  app.listen(PORT, () => console.log(`Listening on ${PORT}`));
});
```

#### Authentication (Pattern A — PIN code)

```javascript
// routes/admin.js
const validCodes = (process.env.MY_SERVICE_CODES || '').split(',').map(s => s.trim());

function requireAuth(req, res, next) {
  const code = req.headers['x-auth-code'];
  if (!code || !validCodes.includes(code)) {
    return res.status(401).json({ error: 'Invalid or missing auth code' });
  }
  next();
}

router.post('/verify', (req, res) => {
  const code = req.headers['x-auth-code'];
  if (validCodes.includes(code)) return res.json({ ok: true });
  res.status(401).json({ error: 'Invalid code' });
});

router.use(requireAuth);
// ... protected routes below
```

### 2. Create the frontend

```
my-service-web/
├── index.html         Guest-facing page
├── admin.html         Staff admin page
└── tv.html            TV display (if applicable)
```

Each HTML file should include:
```html
<meta name="api-url" content="https://my-service-backend.onrender.com">
```

### 3. Deploy

1. **Render:** Create a Web Service with root directory `my-service-backend/`
2. **Environment variables:** Add `DATABASE_URL`, `NODE_ENV=production`, auth codes
3. **Frontend:** Update the `api-url` meta tag with the Render URL
4. **Push to `main`** — GitHub Pages deploys the frontend automatically, Render deploys the backend

### 4. Integrate with Channel Manager (optional)

To show the new service on TVs:
1. Open Channel Manager admin → Slides Library tab
2. Register the TV display URL as a new slide
3. Add it to the desired channels

---

### Related documents

- **[User Manual](USER_MANUAL.md)** — Staff-facing guide for all tools
- **[Operations & Setup Manual](OPERATIONS_MANUAL.md)** — First-time deployment walkthrough
- **[Express Checkout Guide](express-checkout-guide.md)** — Detailed checkout system setup
- **[Channel Manager User Manual](../channel-web/USER_MANUAL.md)** — Detailed channel system docs

---

*RGP — Resort Guest Platform*
