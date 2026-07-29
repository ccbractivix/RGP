# Go4Launch Private Launch Callouts Notes

This document captures the current state of the private launch callouts tool so you can resume later.

## Scope

- This is **for personal/private use** (not linked into public Go4Launch navigation).
- Implemented as a standalone page:
  - `/home/runner/work/RGP/RGP/go4launch/launch-callouts.html`

## What Was Implemented

### Core display

- Full-screen-friendly, large readable UI.
- 4 main elements:
  - Current mission time (`T-` / `T+`)
  - Next callout text
  - Status line (manual/API/sync state)
  - Mode badge (`LIVE` / `REHEARSAL`)

### Modes

- **Manual start default** for launch-day operation.
- **Rehearsal mode** with:
  - Time compression: 2x / 5x / 10x
  - Quick start offset: default `T-2:00` (plus other presets)
  - Pause/resume behavior for rehearsal

### Voice + callouts

- Uses browser speech synthesis for spoken callouts.
- Countdown callouts + final countdown + liftoff.
- Repeating elapsed-time cadence every 15 seconds after T-0.
- Custom mission milestones included:
  - `T+00:02:11` — MECO
  - `T+00:02:15` — Stage Sep, 10 seconds to kickback
  - `T+00:02:28` — Go kickback
  - `T+00:03:22` — Kickback shut down
  - `T+00:06:13` — 30 seconds to return burn
  - `T+00:06:33` — 10 seconds to return burn
  - `T+00:06:43` — Go return burn
  - `T+00:07:04` — Return burn shut down
  - `T+00:07:50` — Landing burn in 10 seconds
  - `T+00:08:00` — Go landing burn

### API sync + slips

- Optional API sync toggle (`/api/launches`).
- In live mode with sync enabled, T-0 updates from API and announces changed T-0 timing.

### Themes + field controls

- **Night mode default:** black background with red text.
- **Day mode:** off-white background with near-black text and red accent.
- Keyboard shortcuts:
  - `F` fullscreen
  - `N` night/day toggle
  - `R` mode toggle (when not actively running)
  - `Space` start/pause rehearsal

### Checklist modal

- Pre-launch checklist includes:
  - Audio test
  - Brightness reminder
  - Hotspot/API check

## How To Run Later (Mac)

1. Clone repo (if not already cloned):
   - `git clone https://github.com/ccbractivix/RGP.git`
2. Start local static server from `go4launch`:
   - `cd /path/to/RGP/go4launch`
   - `python3 -m http.server 8080`
3. Open:
   - `http://localhost:8080/launch-callouts.html`

## If You’re Starting From a Fresh Mac

1. Install command line tools:
   - `xcode-select --install`
2. Verify Python:
   - `python3 --version`
3. If Python missing and Homebrew exists:
   - `brew install python`

## Quick Launch-Day Flow

1. Open page.
2. Run audio test.
3. Set manual T-0.
4. Enable API sync only if desired.
5. Hit fullscreen (`F`) and keep night mode if needed.
6. Start live mode.

## Known Notes / Caveats

- Speech depends on browser/macOS voice availability and tab audio permissions.
- API sync depends on network quality and backend availability.
- This tool is intentionally standalone and private; no public nav wiring was added.

## Suggested Next Improvement (Optional)

- Add mission profile import/export (JSON/YAML) to quickly swap callout sets per rocket/mission.
