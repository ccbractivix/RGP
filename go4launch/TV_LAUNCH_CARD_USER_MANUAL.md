# go4launch TV Launch Card — User Manual

## 1. What this feature is

The **go4launch TV Launch Card** is an automatically managed slide for the Channel Manager system. It creates TV-friendly launch cards for selected Space Coast launches and places them into the building channel playlists without requiring someone to manually register each launch as a slide.

This feature is meant to keep resort TVs updated with:

- the next important upcoming launches
- very recent launches guests may still be asking about
- optional **Rocket Talk LIVE!** event scheduling
- a countdown clock as launches approach
- **breakthrough mode** for imminent launches

In the current implementation, each card stays on screen for **15 seconds** during normal rotation.

---

## 2. What problem it solves

Before this feature, launch-related TV content had to be handled as a general slide or by linking to the broader go4launch display page. The TV Launch Card feature instead:

- creates a dedicated slide per launch with a rocket-specific background image
- keeps the slide list fresh automatically
- removes expired launch cards automatically
- updates the building channel playlists automatically
- forces imminent launches onto all channels via breakthrough mode

This is why you may **not** see it as a permanent hand-entered slide in Channel Manager. It is designed to be auto-managed by the go4launch backend.

---

## 3. Where it appears

### In Channel Manager

When the feature is working correctly, launch-card slides are added automatically to:

- `building-1`
- `building-2`
- `building-3`

There is also a fallback for legacy `front-lobby` channel naming during migration.

In the slide library and playlists, the card label is formatted like:

`go4launch TV • [launch name]`

The description is:

`Auto-managed go4launch TV launch card`

### On TVs

Any TV pointed at one of those building channels will show the launch cards as part of the normal slide rotation.

### Public card URL format

Each generated card uses:

`https://ccbractivix.github.io/RGP/go4launch/tv-launch-card.html?launchId=...`

---

## 4. How the content is selected

The backend automatically pulls launches from Launch Library 2 and selects only launches that match the configured location IDs.

Current selection rules:

- default location IDs: `12,27`
- include launches up to **5 days in the future**
- include launches up to **48 hours in the past**
- keep only the first **3** matching launches after sorting by launch time

This means you will **not** see a TV launch card for every launch in the system. If a launch is too far away, too old, outside the configured locations, or pushed out by other nearer launches, it will not appear.

---

## 5. How often it updates

The go4launch backend:

- runs one sync immediately when the server starts
- runs another sync every **15 minutes** under normal conditions
- switches to **60-second** sync intervals when a launch is within 2 hours

During each sync, it:

1. fetches candidate launches
2. builds the TV launch-card URLs
3. adds missing launch cards to the Channel Manager slide library
4. removes no-longer-needed managed launch cards
5. updates the target building channel playlists
6. manages breakthrough activation for imminent launches

Additionally, the TV launch card page itself refreshes its data via API every **60 seconds** when the launch is within 2 hours of the current time.

---

## 6. Background images and rocket matching

Each TV launch card uses a full-screen background image matched to the rocket type. Six slide images are available in `go4launch/images/`:

| Keyword   | Image file                    |
|-----------|-------------------------------|
| falcon    | `LAUNCH-ALERT-FALCON.jpg`    |
| starship  | `LAUNCH-ALERT-STARSHIP.jpg`  |
| sls       | `LAUNCH-ALERT-SLS.jpg`       |
| atlas     | `LAUNCH-ALERT-ATLAS.jpg`     |
| vulcan    | `LAUNCH-ALERT-VULCAN.jpg`    |
| nova      | `LAUNCH-ALERT-NOVA.jpg`      |

The system uses **fuzzy matching**: if the rocket's full name contains one of these keywords (case-insensitive), the corresponding background image is used. If no match is found, the Falcon image is used as a default.

---

## 7. What appears on each TV launch card

Each card displays the following information overlaid on the background image, in an area 10.896" wide × 11.469" high, positioned .972" from the left and 2.844" from the top:

- **Headline** (at the top of the overlay area) — from the go4launch admin UI
- **Rocket name** — from the launch data
- **Mission name** — from the launch data
- **Launch Date & Time** — in Eastern Time

### Countdown clock

When the launch is within **12 hours**, a countdown timer is displayed showing `T-HH:MM:SS`.

### Rocket Talk LIVE!

If a Rocket Talk LIVE! event is scheduled (via the admin UI), the card shows:

- the event date and time
- the phrase **"in the Movie Theater"**

No descriptive text or notes from the admin UI are included on the TV launch card for Rocket Talk LIVE.

---

## 8. Breakthrough mode

When a launch is within **2 hours** of the current time:

1. The slide is registered as a **Breakthrough** in Channel Manager
2. The breakthrough is forced onto **all operating channels**
3. The TV launch card refreshes its data every **60 seconds** via API
4. The backend sync interval drops from 15 minutes to **60 seconds**

The breakthrough is automatically deactivated and removed when no launches are within the 2-hour window.

Breakthroughs created by this feature are identified by the source tag `go4launch-tv-breakthrough` and will not interfere with manually created breakthroughs.

---

## 9. How to manage the launch-card content

The TV card pulls launch-specific CMS content from the go4launch admin dashboard.

### Open the admin dashboard

Open:

`/admin-ui/index.html` on the go4launch backend

Example deployed path:

`https://your-go4launch-backend/admin-ui/index.html`

### Sign in

Use a valid code from the `GO4LAUNCH_CODES` environment variable.

### Select the launch

You can:

- choose from the **Upcoming & Recent Launches** dropdown, or
- paste a launch UUID manually

### Fields that affect the TV launch card

#### Headline Banner

- Field name: **Headline Banner**
- Purpose: primary launch-card headline (displayed at the top of the info overlay)
- Example use: `LAUNCH TODAY 5:15 PM`
- If blank, the card falls back to `Upcoming Launch`

#### Rocket Talk LIVE! Date & Time

- Field name: **Rocket Talk LIVE! Date & Time (Eastern Time)**
- Purpose: displays the event date/time with "in the Movie Theater" on the TV card
- Enter it in Eastern Time
- Leave blank if there is no event

#### Rocket Talk LIVE! Notes

- Field name: **Rocket Talk LIVE! Notes**
- Note: the notes field is **not shown** on the TV launch card. It is stored for use in other go4launch displays.

### Fields stored for the launch but not used by this TV card

These remain useful elsewhere in go4launch:

- Viewing Guide URL
- Chris Says
- Trajectory
- Photo Gallery URL
- custom launch-card image upload

### Save your changes

Click **Save Content** after updating the fields.

If the launch card is already present in Channel Manager, content edits are read directly from the backend by the card page itself. In other words, launch-card text updates do **not** usually require waiting for the 15-minute sync; the sync is mainly what controls which launch cards are added to or removed from Channel Manager.

---

## 10. How to confirm that it is in Channel Manager

If you want to verify that the feature is present in Channel Manager:

1. Open the Channel Manager admin page.
2. Sign in with a valid channel code.
3. Go to **Slides Library**.
4. Look for slides whose label starts with `go4launch TV •`.
5. Open one of the building channels (`building-1`, `building-2`, or `building-3`).
6. Confirm those same slides are present in the playlist.

Important: because these are auto-managed, they may appear and disappear as launches age out of the selection window.

---

## 11. Why you may not see it in Channel Manager

If you built `go4launch/tv-launch-card.html` but do not see it in Channel Manager, check these items in order.

### A. The sync environment variables are missing

The go4launch backend must have:

- `CHANNEL_API_URL`
- `CHANNEL_ADMIN_CODE`

If either one is missing, the backend skips TV launch-card sync entirely.

### B. The target channels do not exist with the expected names/IDs

The sync looks for these channels:

- `building-1`
- `building-2`
- `building-3`

and also recognizes legacy `front-lobby` as a fallback for building 1.

If those channels are missing, playlist sync will be skipped.

### C. The launch is outside the TV selection window

The card will not be generated if the launch is:

- more than 5 days away
- more than 48 hours old
- outside the configured location IDs
- pushed out because only 3 cards are kept

### D. The sync has not run yet

Wait up to 15 minutes after deployment, restart, or relevant launch changes (or 60 seconds if a launch is within 2 hours).

### E. The card is in the library but not where you expected

This feature adds the cards automatically to the building channel playlists. It is not intended to show up as a one-time manual registration task.

### F. The launch ID page itself is failing

Open the direct card URL in a browser:

`https://ccbractivix.github.io/RGP/go4launch/tv-launch-card.html?launchId=YOUR_LAUNCH_ID`

Possible page-level messages include:

- `Launch card unavailable (missing launchId).`
- `Launch card unavailable (launch not found).`
- `Launch card unavailable (data error).`

Current fallback behavior for unresolved launch IDs:

- The card now attempts `GET /api/launches/:id` first, then falls back to `GET /api/archive/launch/:id`.
- If launch payload data is still unavailable but CMS content exists (for example Rocket Talk LIVE! date/time), the page renders a branded fallback card instead of a black error screen.
- If both launch and CMS data are unavailable, the page still shows an explicit unavailable message.

Managed stale-card cleanup behavior:

- During TV card sync, managed slide URLs are checked for unresolved `launchId` values.
- Managed cards whose `launchId` cannot be resolved in current launch candidates or archive data are removed from the Channel Manager slide library during sync.
- Sync logs include unresolved launch IDs so operators can identify stale URLs quickly.

---

## 12. Day-to-day operating procedure

Recommended staff workflow:

1. Open the go4launch admin dashboard each time an important launch is approaching.
2. Select the launch.
3. Enter or update:
   - Headline Banner
   - Rocket Talk LIVE! Date & Time (notes are not shown on TV)
4. Save the content.
5. Wait for the next sync cycle if needed.
6. Verify the slide in Channel Manager and on a building TV.

---

## 13. Technical reference

### Main frontend file

- `go4launch/tv-launch-card.html`

### Background images

- `go4launch/images/LAUNCH-ALERT-*.jpg` (6 images for different rocket types)

### Backend sync logic

- `go4launch-backend/services/tvLaunchCardSync.js`

### Backend scheduler startup

- `go4launch-backend/server.js`

### Channel player breakthrough support

- `channel-web/player.html` (supports URL-based breakthroughs via `slide_url`)

### Related backend documentation

- `go4launch-backend/README.md`

### Environment variables used by this feature

- `CHANNEL_API_URL`
- `CHANNEL_ADMIN_CODE`
- `GO4LAUNCH_TV_CARD_BASE_URL`
- `GO4LAUNCH_LOCATION_IDS`
- `LL2_API_KEY` (optional, if used for LL2 requests)

---

## 14. Quick troubleshooting checklist

If the feature is missing:

- Confirm the go4launch backend is running
- Confirm `CHANNEL_API_URL` is set
- Confirm `CHANNEL_ADMIN_CODE` is set
- Confirm the channel backend is reachable
- Confirm `building-1`, `building-2`, and `building-3` exist
- Confirm the launch fits the current time/location rules
- Wait 15 minutes and refresh Channel Manager (or 60 seconds near launch)
- Test the direct `tv-launch-card.html?launchId=...` URL in a browser

---

## 15. Summary

The go4launch TV Launch Card feature is an **automatic bridge** between go4launch and Channel Manager. Staff maintain launch-specific messaging in the go4launch admin UI, and the backend takes care of publishing short-lived launch cards into the building TV channels.

Key behaviors:

- **Normal mode:** 15-second rotation in building channel playlists, 15-minute sync
- **Within 12 hours:** countdown clock displayed on the slide
- **Within 2 hours:** breakthrough mode forces the slide onto all channels, 60-second refresh and sync

If you do not see it in Channel Manager, the cause is usually one of four things:

- sync environment variables are missing
- expected building channels are missing
- the launch is outside the selection rules
- the sync has not run yet
