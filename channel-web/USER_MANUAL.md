# 📺 Channel Manager — User Manual

**Version 1.0 — TV Display Channel System for Resort Properties**

---

## Table of Contents

1. [What Is This?](#1-what-is-this)
2. [Quick Start (The 5-Minute Version)](#2-quick-start)
3. [The Big Picture — How It Works](#3-the-big-picture)
4. [Setting Up the Backend (One-Time)](#4-setting-up-the-backend)
5. [Using the Admin Dashboard](#5-using-the-admin-dashboard)
   - [Logging In](#logging-in)
   - [The Channels Tab](#the-channels-tab)
   - [Creating a New Channel](#creating-a-new-channel)
   - [Editing a Channel](#editing-a-channel)
   - [The Slides Library Tab](#the-slides-library-tab)
   - [The Breakthroughs Tab](#the-breakthroughs-tab)
   - [The Monitor Tab](#the-monitor-tab)
6. [Setting Up a TV](#6-setting-up-a-tv)
7. [Creating Custom Slides](#7-creating-custom-slides)
8. [Breakthroughs (Emergency Messaging)](#8-breakthroughs)
9. [Lightning Alerts](#9-lightning-alerts)
10. [Troubleshooting](#10-troubleshooting)
11. [Technical Reference](#11-technical-reference)
12. [Glossary](#12-glossary)

---

## 1. What Is This?

The Channel Manager is a system that turns your resort TVs into dynamic digital signage. Instead of each TV showing one static page, you can now:

- **Create channels** — Think of them like TV stations. "Front Lobby" is one channel, "Building 3" is another.
- **Build playlists** — Each channel rotates through a list of content pages (theater showtimes, launch tracker, amenity status, custom announcements) in a smooth slideshow.
- **Set durations** — Show the theater schedule for 30 seconds, then switch to the launch tracker for 45 seconds, then amenity status for 20 seconds. You decide.
- **Push emergency messages** — Need to tell every TV in the resort about an emergency? One button, every screen, instantly.
- **Automatic lightning alerts** — When the amenities team triggers a lightning closure, any channel you've enabled will automatically show a weather banner.
- **Monitor your TVs** — See which TVs are online and when they last checked in.

**You don't need to be a programmer to use this.** If you can use a smartphone, you can manage the channels.

---

## 2. Quick Start

Here's the absolute fastest path from "I have nothing" to "a TV is showing a slideshow":

1. **Open the Admin page** in any web browser:
   ```
   https://ccbractivix.github.io/RGP/channel-web/admin.html
   ```

2. **Enter your 4-digit access code** and click Sign In.

3. You'll see the **Channels** tab with some pre-built channels (Front Lobby, Building Two, etc.).

4. **Click on a channel** (e.g., "Front Lobby") to edit it. You'll see its playlist of slides. If it's empty, add some by clicking the **+** button next to available slides.

5. **Set durations** — Each slide in the playlist has a number (in seconds) for how long it stays on screen. The default is 30 seconds. Change it to whatever you want.

6. **Click Save Channel**.

7. **On your TV's browser**, navigate to:
   ```
   https://ccbractivix.github.io/RGP/channel-web/player.html?channel=front-lobby
   ```
   Replace `front-lobby` with whatever channel ID you want.

8. **That's it.** The TV will start cycling through the slides automatically. It'll keep running forever — no babysitting required.

---

## 3. The Big Picture

```
                    ┌─────────────────┐
                    │   Admin (You)    │
                    │   admin.html     │
                    └────────┬────────┘
                             │ creates/edits channels
                             ▼
                    ┌─────────────────┐
                    │  Channel Backend │
                    │  (Render server) │
                    └────────┬────────┘
                             │ serves config + alerts
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
     ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
     │  Lobby TV     │ │ Bldg 3 TV    │ │ Restaurant TV│
     │  player.html  │ │  player.html │ │  player.html │
     │  ?channel=    │ │  ?channel=   │ │  ?channel=   │
     │  front-lobby  │ │  building-3  │ │  restaurant  │
     └──────────────┘ └──────────────┘ └──────────────┘
           │                 │                │
           ▼                 ▼                ▼
     ┌─────────┐       ┌─────────┐      ┌─────────┐
     │ iframe   │      │ iframe   │     │ iframe   │
     │ Theater  │──►   │ Amenities│──►  │ Go4Launch│──► (cycles)
     │ Schedule │      │ Status   │     │ Tracker  │
     └─────────┘       └─────────┘      └─────────┘
```

The **player** is a web page that runs on each TV. It loads a channel configuration from the backend, then uses invisible iframes to cycle through content pages with a smooth crossfade effect. Each content page (theater schedule, launch tracker, amenity status) is a self-contained web page that fetches its own data independently.

---

## 4. Setting Up the Backend

> **This section is for the person deploying the system for the first time.** If the backend is already running, skip to [Section 5](#5-using-the-admin-dashboard).

### What You Need

- A **Render** account (or any Node.js hosting platform)
- A **PostgreSQL** database (Render provides this)
- The `channel-backend/` folder from this repository

### Environment Variables

Set these on your hosting platform:

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DATABASE_URL` | ✅ Yes | PostgreSQL connection string | `postgres://user:pass@host:5432/dbname` |
| `CHANNEL_CODES` | ✅ Yes | Comma-separated 4-digit admin codes | `1234,5678` |
| `CORS_ORIGIN` | Optional | Extra allowed origins (comma-separated) | `https://example.com` |
| `AMENITIES_API_URL` | Optional | Amenities backend URL for lightning polling | `https://amenities-web.onrender.com/api/status` |
| `PORT` | Optional | Server port (default: 3003) | `3003` |
| `NODE_ENV` | Optional | Set to `production` for SSL connections | `production` |

### Deploy Steps (Render)

1. Create a new **Web Service** on Render
2. Connect your GitHub repo
3. Set **Root Directory** to `channel-backend`
4. Set **Build Command** to `npm install`
5. Set **Start Command** to `npm start`
6. Add the environment variables above
7. Deploy!

The server will automatically create all database tables and seed the default channels and slides on first start.

### Update Frontend API URL

After deploying, update the `<meta name="api-url">` tag in both `channel-web/player.html` and `channel-web/admin.html` to point to your actual backend URL:

```html
<meta name="api-url" content="https://your-channel-backend.onrender.com">
```

---

## 5. Using the Admin Dashboard

### Logging In

1. Open `https://ccbractivix.github.io/RGP/channel-web/admin.html`
2. Enter your 4-digit access code
3. Click **Sign In** (or press Enter)

Your code is remembered until you log out. If someone else needs access, give them a code from the `CHANNEL_CODES` environment variable.

**Forgot your code?** Check with whoever manages the Render environment variables, or look at the `CHANNEL_CODES` setting.

---

### The Channels Tab

This is the main screen. You'll see a card for each channel showing:

- **Channel name** (e.g., "Front Lobby")
- **Channel ID** (e.g., `front-lobby`) — this is what goes in the player URL
- **Slide count** — how many slides are in the playlist
- **Online status** — green dot if a TV is actively running this channel, red if it's been offline for more than 2 minutes, gray if no TV has ever connected

Click any channel card to edit it.

---

### Creating a New Channel

1. Click the **+ New Channel** button
2. Fill in:
   - **Channel ID**: Lowercase letters, numbers, and hyphens only. This becomes part of the URL. Examples: `pool-area`, `spa-entrance`, `kids-club`
   - **Display Name**: Human-readable name. Examples: "Pool Area", "Spa Entrance", "Kids Club"
3. **Add slides** to the playlist (see below)
4. **Set the Lightning Alert rule** if this channel should show weather warnings
5. Click **Save Channel**

---

### Editing a Channel

When you click a channel card, the editor opens with two panels:

#### Left Panel: Available Slides
These are all the slide pages registered in the system. Click the **+** button next to any slide to add it to this channel's playlist.

#### Right Panel: Playlist
This is the ordered list of slides that will cycle on this channel. For each slide:

- **Drag to reorder** — Grab a slide and drag it up or down to change the order
- **Duration** — The number in the box is how many seconds this slide stays on screen before transitioning to the next one. Minimum is 5 seconds, maximum is 600 (10 minutes). The default is 30 seconds.
  - **Tip:** 30 seconds works well for information-dense pages like the theater schedule. For simpler pages or announcements, 15–20 seconds is fine. For the launch tracker (which has live countdowns), 45–60 seconds lets people watch the countdown tick.
- **Remove (×)** — Click to remove the slide from this channel's playlist. (This doesn't delete it from the library — you can add it back anytime.)

#### Lightning Alert Rule
- **Disabled** — This channel will NOT show a lightning banner, even if water amenities are closed due to lightning.
- **Enabled** — When the amenities system reports a lightning closure, an amber banner will automatically appear at the bottom of this channel's display: "⚡ WEATHER CLOSURE IN EFFECT — WATER AMENITIES TEMPORARILY CLOSED ⚡"

**When to enable this:** Enable it for channels visible to guests near water amenities (pool area, building lobbies). Disable it for channels in areas where it's not relevant (restaurant, conference rooms).

#### Other Buttons
- **Preview ↗** — Opens the player page for this channel in a new tab so you can see what it looks like
- **Delete** — Permanently deletes this channel and all its slide assignments. You'll be asked to confirm.
- **Cancel** — Closes the editor without saving changes

---

### The Slides Library Tab

This shows all the content pages registered in the system. The system comes pre-loaded with three slides:

| Slide | What It Shows |
|-------|---------------|
| **Theater Showtimes** | 7-day movie schedule from the theater system |
| **Launch Tracker** | Space launch countdown from Go4Launch |
| **Amenity Status** | Real-time pool/spa/activity status grid |

#### Registering a New Slide

Click **+ Register Slide** and fill in:
- **URL**: The full web address of the page. This can be any web page — it will be loaded in an iframe.
- **Label**: A short name for the slide (shown in the admin UI and channel editor)
- **Description** (optional): Notes about what this slide shows

**Examples of slides you might register:**
- A custom welcome page you've built
- A static image or announcement (use the `slide.html` template — see [Section 7](#7-creating-custom-slides))
- A weather widget page
- A QR code landing page

#### Removing a Slide
Click the **Remove** button on a slide card. This removes it from the library but does NOT automatically remove it from channels that are currently using it. The channels will still try to load the URL — so if the page still exists, it'll still work.

---

### The Breakthroughs Tab

Breakthroughs are emergency or special messages that take over the entire screen on targeted channels. Think: fire alarm instructions, severe weather warnings, special announcements.

See [Section 8](#8-breakthroughs) for full details.

---

### The Monitor Tab

This shows a live view of which TVs are checking in. Each TV running a player page sends a "heartbeat" signal every 60 seconds. The monitor shows:

- **Channel name and ID**
- **Status dot**: Green = online (heard from in the last 2 minutes), Red = offline
- **Last seen**: How long ago the TV last checked in

**What "offline" means:** The TV might be turned off, the browser might have been closed, or there might be a network issue. It doesn't necessarily mean the TV is broken — it just means it hasn't reported in recently.

---

## 6. Setting Up a TV

### What You Need
- A TV with an HDMI input
- A device that can run a web browser (smart TV, Chromecast, Fire TV Stick, Raspberry Pi, old laptop — anything with a browser)
- Wi-Fi or Ethernet connection

### Steps

1. Connect your device to the TV via HDMI
2. Open a web browser on the device (Chrome, Firefox, Edge, Safari — any modern browser works)
3. Navigate to:
   ```
   https://ccbractivix.github.io/RGP/channel-web/player.html?channel=YOUR-CHANNEL-ID
   ```
   Replace `YOUR-CHANNEL-ID` with the channel you want this TV to show. For example:
   - `?channel=front-lobby` for the Front Lobby channel
   - `?channel=building-3` for Building Three
   - `?channel=restaurant` for the Restaurant

4. **Go full screen** — Press F11 (or the full-screen button on your browser) to hide the address bar and make the display fill the entire screen

5. **That's it!** The player will:
   - Load the channel configuration
   - Start cycling through slides with smooth crossfade transitions
   - Check for emergency breakthroughs every 15 seconds
   - Send a heartbeat to the backend every 60 seconds (so you can monitor it from the admin)
   - Auto-refresh its configuration every 5 minutes (so if you add/remove slides from the admin, the TV picks it up without restarting)

### Tips for TV Setup
- **Bookmark the URL** so you can easily reopen it if the browser restarts
- **Set the browser to auto-start** on boot and open the player URL — this way if power is lost and restored, the TV comes back automatically
- **Disable screen savers and sleep mode** on the connected device
- **If the TV loses internet**, the player will keep showing the last loaded slide and use its cached configuration. When connectivity returns, it picks up right where it left off.

---

## 7. Creating Custom Slides

The system includes a `slide.html` template for creating simple announcement slides without any coding. You build the slide by putting parameters in the URL.

### Basic Format
```
https://ccbractivix.github.io/RGP/channel-web/slide.html?title=YOUR+TITLE&message=YOUR+MESSAGE
```

### Available Parameters

| Parameter | What It Does | Example |
|-----------|--------------|---------|
| `title` | Large text at the top | `title=WELCOME+TO+THE+RESORT` |
| `message` | Smaller text below the title | `message=Check+in+begins+at+3+PM` |
| `image` | URL of an image to display | `image=https://example.com/photo.jpg` |
| `bg` | Background color | `bg=%23002244` (use `%23` for `#`) |
| `color` | Text color | `color=%23FFFFFF` |

### Examples

**Welcome slide (dark background, white text):**
```
slide.html?title=WELCOME&message=Enjoy+your+stay!&bg=%23002244&color=%23FFFFFF
```

**Event announcement with image:**
```
slide.html?title=TONIGHT&message=Live+Music+at+8+PM&image=https://example.com/band.jpg
```

**Simple text-only message:**
```
slide.html?title=POOL+HOURS&message=Open+8+AM+to+10+PM+Daily&bg=%231a1a1a&color=%2322c55e
```

### How to Use Custom Slides

1. Build your slide URL using the parameters above
2. Test it by pasting the URL in your browser — you should see the slide
3. Go to the **Slides Library** tab in the admin
4. Click **+ Register Slide**
5. Paste the full URL and give it a label
6. Now you can add it to any channel's playlist!

### Color Reference
Use `%23` instead of `#` in URLs. Some useful colors:
- `%23000000` = Black
- `%23FFFFFF` = White
- `%23D32F2F` = Red
- `%2322c55e` = Green
- `%233b82f6` = Blue
- `%23f59e0b` = Amber/Gold
- `%23002244` = Navy
- `%231a1a1a` = Dark gray

---

## 8. Breakthroughs

A "breakthrough" is a message that takes over the entire screen on one or more channels. Use it for emergencies, important announcements, or anything that needs to interrupt the normal slideshow.

### Creating a Breakthrough

1. Go to the **Breakthroughs** tab
2. Click **+ New Breakthrough**
3. Fill in:
   - **Title**: Large text shown at the top of the screen (e.g., "EMERGENCY NOTICE", "ATTENTION", "SPECIAL ANNOUNCEMENT")
   - **Message**: The detailed message shown below the title
   - **Background Color**: The color of the full-screen overlay (default: red `#D32F2F`)
   - **Text Color**: Color of the text (default: white `#FFFFFF`)
   - **Target Channels**: Check the boxes for which channels should show this breakthrough. **Leave all unchecked to target ALL channels.**
4. Click **Save**

### Activating a Breakthrough

Creating a breakthrough does NOT make it appear on screens. It's saved as a template ready to go.

To make it live:
1. Find the breakthrough card in the list
2. Click the **🚨 ACTIVATE** button
3. You'll be asked to confirm — click OK
4. **Within 15 seconds**, every targeted channel's display will show your breakthrough message as a full-screen overlay. The normal slideshow pauses behind it.

### Deactivating a Breakthrough

1. Find the active breakthrough (it has a red border and says "● LIVE")
2. Click **Deactivate**
3. The overlay disappears from all TVs within 15 seconds, and the normal slideshow resumes

### Breakthrough Tips

- **Pre-create your breakthroughs** before you need them. In an emergency, you don't want to be typing — you want to press one button.
- **Suggested pre-built breakthroughs:**
  - "FIRE ALARM — Please proceed to the nearest exit" (red background)
  - "SEVERE WEATHER — Seek shelter immediately" (dark background)
  - "POOL CLOSED — Will reopen shortly" (amber background)
  - "SPECIAL EVENT — See front desk for details" (blue background)
- **Only one breakthrough shows at a time.** If you activate two, only the highest priority one is displayed. But typically you'll only have one active.

---

## 9. Lightning Alerts

Lightning alerts are **automatic**. When the amenities team triggers a lightning closure (via the Amenities Control Panel at `amenities-web/admin.html`), any channel with the Lightning Alert rule enabled will automatically display an amber banner at the bottom of the screen:

> ⚡ WEATHER CLOSURE IN EFFECT — WATER AMENITIES TEMPORARILY CLOSED ⚡

This happens within about 30 seconds of the lightning closure being triggered.

When the lightning closure is cleared (either manually or by auto-reopen timer), the banner disappears automatically.

### How to Enable/Disable Lightning Alerts Per Channel

1. Open a channel in the editor
2. Find the **Lightning Alert Rule** dropdown
3. Set it to **Enabled** or **Disabled**
4. Click **Save Channel**

### When to Enable
- **Front Lobby** — Yes, guests need to know before heading to the pool
- **Building lobbies** — Yes, same reason
- **Restaurant** — Maybe not, unless it overlooks the pool area
- **Indoor-only areas** — Probably not needed

---

## 10. Troubleshooting

### "The TV is showing a black screen"

1. **Check the URL** — Make sure the `?channel=` parameter matches an actual channel ID from the admin
2. **Check the network** — The TV/device needs internet access
3. **Open the browser console** (F12 → Console tab) — look for error messages
4. **Check the admin Monitor tab** — Is the TV's heartbeat showing? If not, the device isn't reaching the backend

### "The slides aren't changing"

- If there's only one slide in the channel, it won't rotate — it just stays on that one page
- Check that the slide durations aren't set extremely high (e.g., 600 seconds = 10 minutes)
- If a breakthrough is active, the slideshow is paused until the breakthrough is deactivated

### "I changed the slides in the admin but the TV hasn't updated"

The player refreshes its configuration every 5 minutes. Wait a few minutes and the TV will pick up the new playlist automatically. If you need it to update immediately, refresh the browser page on the TV.

### "The lightning banner isn't showing"

1. Check that the channel has **Lightning Alert Rule = Enabled** in the editor
2. Check that the amenities system actually has a lightning closure active (check `amenities-web/admin.html`)
3. Check the admin dashboard — the lightning status badge in the top-right should say "⚡ Lightning Active"
4. The channel backend polls the amenities backend every 30 seconds, and the player checks every 15 seconds. Allow up to 45 seconds for the banner to appear.

### "I can't log in to the admin"

- Make sure you're using the correct 4-digit code
- The code is set in the `CHANNEL_CODES` environment variable on the backend
- Try clearing your browser's localStorage: Open browser console (F12), type `localStorage.removeItem('channel_code')`, then refresh

### "The backend won't start"

- Check that `DATABASE_URL` is set correctly
- Check that `CHANNEL_CODES` has at least one code
- Check the Render logs for error messages
- Make sure the PostgreSQL database is accessible

---

## 11. Technical Reference

### Architecture

| Component | Technology | Hosting | Purpose |
|-----------|------------|---------|---------|
| `channel-backend/` | Node.js + Express + PostgreSQL | Render | API server — stores channels, slides, breakthroughs |
| `channel-web/player.html` | Vanilla HTML/JS | GitHub Pages | TV display — iframe carousel player |
| `channel-web/admin.html` | Vanilla HTML/JS | GitHub Pages | Admin dashboard — manage everything |
| `channel-web/slide.html` | Vanilla HTML/JS | GitHub Pages | Static content template for custom slides |

### API Endpoints

#### Public (no auth required)

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/channels/:id` | Get channel config (slides, durations) |
| GET | `/api/channels/:id/alerts` | Get active breakthroughs and lightning status |
| POST | `/api/channels/:id/heartbeat` | Player health check ping |
| GET | `/health` | Server health check |

#### Admin (requires `X-Auth-Code` header)

| Method | URL | Description |
|--------|-----|-------------|
| POST | `/admin/verify` | Check if access code is valid |
| GET | `/admin/channels` | List all channels |
| POST | `/admin/channels` | Create a new channel |
| PUT | `/admin/channels/:id` | Update channel name |
| DELETE | `/admin/channels/:id` | Delete a channel |
| GET | `/admin/channels/:id/slides` | Get slides for a channel |
| PUT | `/admin/channels/:id/slides` | Replace all slides (atomic) |
| GET | `/admin/channels/:id/rules` | Get rules for a channel |
| PUT | `/admin/channels/:id/rules` | Set a rule |
| GET | `/admin/slides` | List all available slides |
| POST | `/admin/slides` | Register a new slide |
| DELETE | `/admin/slides/:id` | Remove a slide |
| GET | `/admin/breakthroughs` | List all breakthroughs |
| POST | `/admin/breakthroughs` | Create a breakthrough |
| PUT | `/admin/breakthroughs/:id` | Update a breakthrough |
| POST | `/admin/breakthroughs/:id/activate` | Activate (make live) |
| POST | `/admin/breakthroughs/:id/deactivate` | Deactivate |
| DELETE | `/admin/breakthroughs/:id` | Delete a breakthrough |
| GET | `/admin/heartbeats` | List all TV heartbeats |
| GET | `/admin/lightning` | Get lightning poller status |

### Timing

| What | Interval | Notes |
|------|----------|-------|
| Slide rotation | Per-slide (5–600 sec) | Configured per slide in the playlist |
| Alert polling | 15 seconds | Player checks for breakthroughs/lightning |
| Heartbeat | 60 seconds | Player pings backend to say "I'm alive" |
| Config refresh | 5 minutes | Player re-fetches channel config (picks up changes) |
| Lightning polling | 30 seconds | Backend polls amenities-backend |
| Pre-load | 12 seconds | Next iframe loads this many seconds before transition |

### Default Channels (Seed Data)

| ID | Name |
|----|------|
| `front-lobby` | Front Lobby |
| `building-2` | Building Two |
| `building-3` | Building Three |
| `restaurant` | Restaurant |
| `no-limits` | No Limits |

### Default Slides (Seed Data)

| Label | URL |
|-------|-----|
| Theater Showtimes | `https://ccbractivix.github.io/RGP/theater-web/tv.html` |
| Launch Tracker | `https://ccbractivix.github.io/RGP/go4launch/tv.html` |
| Amenity Status | `https://ccbractivix.github.io/RGP/amenities-web/tv.html` |

---

## 12. Glossary

| Term | What It Means |
|------|---------------|
| **Channel** | A named playlist of slides configured for a specific TV location. Like a TV station. |
| **Slide** | A single web page (URL) that can be added to channel playlists. |
| **Playlist** | The ordered list of slides assigned to a channel, with durations for each. |
| **Player** | The web page (`player.html`) that runs on a TV and cycles through a channel's slides. |
| **Breakthrough** | An emergency or special message that takes over the entire screen on targeted channels. |
| **Lightning Alert** | An automatic weather banner that appears when the amenities system reports a lightning closure. |
| **Heartbeat** | A periodic "I'm alive" signal sent by each player to the backend for monitoring. |
| **Crossfade** | The smooth visual transition between slides — one fades out while the next fades in. |
| **iframe** | A web technology that lets one web page display another web page inside it. Each slide runs in its own iframe. |
| **Seed data** | Default channels and slides that are automatically created when the backend starts for the first time. |
| **Auth code** | A 4-digit number used to log into the admin dashboard. Set in the backend's environment variables. |

---

*Built for RGP Resort Properties. Questions? Check the troubleshooting section or examine the backend logs on Render.*
