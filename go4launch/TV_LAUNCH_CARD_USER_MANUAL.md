# go4launch TV Launch Card — User Manual

## 1. What this feature is

The **go4launch TV Launch Card** is an automatically managed slide for the Channel Manager system. It creates TV-friendly launch cards for selected Space Coast launches and places them into the building channel playlists without requiring someone to manually register each launch as a slide.

This feature is meant to keep resort TVs updated with:

- the next important upcoming launches
- very recent launches guests may still be asking about
- a QR code that sends guests to the public go4launch page
- optional **Rocket Talk LIVE!** information entered by staff

In the current implementation, each card stays on screen for **15 seconds**.

---

## 2. What problem it solves

Before this feature, launch-related TV content had to be handled as a general slide or by linking to the broader go4launch display page. The TV Launch Card feature instead:

- creates a dedicated slide per launch
- keeps the slide list fresh automatically
- removes expired launch cards automatically
- updates the building channel playlists automatically

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
- runs another sync every **15 minutes**

During each sync, it:

1. fetches candidate launches
2. builds the TV launch-card URLs
3. adds missing launch cards to the Channel Manager slide library
4. removes no-longer-needed managed launch cards
5. updates the target building channel playlists

If you just changed content and do not see it yet, allow up to **15 minutes** for the next sync cycle.

---

## 6. What appears on each TV launch card

Each card can show:

- a headline
- rocket name
- mission name
- launch date and time in **Eastern Time**
- a QR code to the public go4launch page
- optional **Rocket Talk LIVE!** date/time
- optional **Rocket Talk LIVE!** notes
- a different call to action for very recent launches versus upcoming launches

Behavior details:

- **Upcoming launch:** shows the configured headline, or `Upcoming Launch` if none is saved
- **Recent launch (within 48 hours after launch):** switches to `Did you see this launch?`
- the card note indicates that the display rotates every 15 seconds

---

## 7. How to manage the launch-card content

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
- Purpose: primary launch-card headline
- Example use: `LAUNCH TODAY 5:15 PM`
- If blank, the card falls back to `Upcoming Launch`

#### Rocket Talk LIVE! Date & Time

- Field name: **Rocket Talk LIVE! Date & Time (Eastern Time)**
- Purpose: displays a Rocket Talk LIVE! block on the TV card
- Enter it in Eastern Time
- Leave blank if there is no event

#### Rocket Talk LIVE! Notes

- Field name: **Rocket Talk LIVE! Notes**
- Purpose: adds supporting text under the Rocket Talk LIVE! heading
- Example use: theater location, host name, attendance note

### Fields stored for the launch but not used by this TV card

These remain useful elsewhere in go4launch, but they are not the main drivers of the TV launch card itself:

- Viewing Guide URL
- Chris Says
- Trajectory
- Photo Gallery URL
- custom launch-card image upload

### Save your changes

Click **Save Content** after updating the fields.

If the launch card is already present in Channel Manager, content edits are read directly from the backend by the card page itself. In other words, launch-card text updates do **not** usually require waiting for the 15-minute sync; the sync is mainly what controls which launch cards are added to or removed from Channel Manager.

---

## 8. How to confirm that it is in Channel Manager

If you want to verify that the feature is present in Channel Manager:

1. Open the Channel Manager admin page.
2. Sign in with a valid channel code.
3. Go to **Slides Library**.
4. Look for slides whose label starts with `go4launch TV •`.
5. Open one of the building channels (`building-1`, `building-2`, or `building-3`).
6. Confirm those same slides are present in the playlist.

Important: because these are auto-managed, they may appear and disappear as launches age out of the selection window.

---

## 9. Why you may not see it in “Channel Master”

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

Wait up to 15 minutes after deployment, restart, or relevant launch changes.

### E. The card is in the library but not where you expected

This feature adds the cards automatically to the building channel playlists. It is not intended to show up as a one-time manual registration task.

### F. The launch ID page itself is failing

Open the direct card URL in a browser:

`https://ccbractivix.github.io/RGP/go4launch/tv-launch-card.html?launchId=YOUR_LAUNCH_ID`

Possible page-level messages include:

- `Launch card unavailable (missing launchId).`
- `Launch card unavailable (launch not found).`
- `Launch card unavailable (data error).`

---

## 10. Day-to-day operating procedure

Recommended staff workflow:

1. Open the go4launch admin dashboard each time an important launch is approaching.
2. Select the launch.
3. Enter or update:
   - Headline Banner
   - Rocket Talk LIVE! Date & Time
   - Rocket Talk LIVE! Notes
4. Save the content.
5. Wait for the next sync cycle if needed.
6. Verify the slide in Channel Manager and on a building TV.

---

## 11. Technical reference

### Main frontend file

- `go4launch/tv-launch-card.html`

### Backend sync logic

- `go4launch-backend/services/tvLaunchCardSync.js`

### Backend scheduler startup

- `go4launch-backend/server.js`

### Related backend documentation

- `go4launch-backend/README.md`

### Environment variables used by this feature

- `CHANNEL_API_URL`
- `CHANNEL_ADMIN_CODE`
- `GO4LAUNCH_TV_CARD_BASE_URL`
- `GO4LAUNCH_LOCATION_IDS`
- `LL2_API_KEY` (optional, if used for LL2 requests)

---

## 12. Quick troubleshooting checklist

If the feature is missing:

- Confirm the go4launch backend is running
- Confirm `CHANNEL_API_URL` is set
- Confirm `CHANNEL_ADMIN_CODE` is set
- Confirm the channel backend is reachable
- Confirm `building-1`, `building-2`, and `building-3` exist
- Confirm the launch fits the current time/location rules
- Wait 15 minutes and refresh Channel Manager
- Test the direct `tv-launch-card.html?launchId=...` URL in a browser

---

## 13. Summary

The go4launch TV Launch Card feature is an **automatic bridge** between go4launch and Channel Manager. Staff maintain launch-specific messaging in the go4launch admin UI, and the backend takes care of publishing short-lived launch cards into the building TV channels.

If you do not see it in Channel Manager, the cause is usually one of four things:

- sync environment variables are missing
- expected building channels are missing
- the launch is outside the selection rules
- the 15-minute sync has not run yet
