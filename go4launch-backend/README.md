# go4launch-backend

Standalone backend for the **go4launch** Space Coast launch tracker.

## Setup

1. Deploy on Render (or any Node.js host) as a Web Service
2. Set environment variables (see below)
3. Update the `api-base` meta tag in `go4launch/index.html` to the deployed URL

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `LL2_API_KEY` | Recommended | Launch Library 2 API key (The Space Devs). Sent as `Authorization: Token …`. Strongly recommended in production — unauthenticated LL2 access is rate-limited to ~25 requests/hour per IP, which can cause launches to stop appearing. |
| `GO4LAUNCH_CODES` | Yes | Comma-separated admin auth codes (e.g. `1234,5678`) |
| `GITHUB_TOKEN` | For image uploads | GitHub personal access token |
| `GITHUB_REPO` | For image uploads | GitHub repo (e.g. `ccbractivix/RGP`) |
| `GITHUB_BRANCH` | No | Branch for image commits (default: `main`) |
| `SENDGRID_API_KEY` | For emails | SendGrid API key (requires Mail Send permission) |
| `SENDGRID_FROM` | For emails | Verified sender email address in your SendGrid account (required when `SENDGRID_API_KEY` is set) |
| `GO4LAUNCH_ARCHIVE_URL` | No | Public frontend URL (default: `https://ccbractivix.github.io/RGP/go4launch`) |
| `CHANNEL_API_URL` | No | (Reserved) |
| `CHANNEL_ADMIN_CODE` | No | (Reserved) |
| `GO4LAUNCH_LOCATION_IDS` | No | Comma-separated LL2 location IDs (default: `12,27`) |
| `LL2_BASE_URL` | No | Override the LL2 base URL/version (default: `https://ll.thespacedevs.com/2.3.0`) |
| `LL2_VERSION_CHECK_CRON` | No | Cron expression for the scheduled LL2 version monitor (default: `0 7 * * *`, i.e. daily 7:00 AM Eastern) |
| `LL2_ALERT_WEBHOOK_URL` | No | Incoming webhook (Slack/Discord/Teams) to actively notify when LL2 looks deprecated or a newer version appears. If unset, alerts go to the logs only |
| `CORS_ORIGIN` | No | Additional allowed CORS origins (comma-separated) |
| `PORT` | No | Server port (default: `3002`) |
| `NODE_ENV` | No | Set to `production` for SSL database connections |

## API Routes

### Public (`/api`)
- `GET /api/content` — All CMS content
- `GET /api/content/:launchId` — Single launch content
- `GET /api/launches` — Upcoming/recent LL2 launches (proxy + cache)
- `GET /api/ll2-status` — Latest result of the scheduled LL2 API version/deprecation monitor
- `POST /api/archive` — Archive a completed launch
- `GET /api/archive` — Archive index
- `GET /api/archive/:year/:month` — Launches for a month
- `GET /api/archive/launch/:id` — Single archived launch
- `POST /api/saw-it` — Submit "I saw this" email

### Admin (`/admin`) — requires `X-Auth-Code` header
- `POST /admin/verify` — Verify an auth code (no auth required)
- `GET /admin/content/:launchId` — Load content for editing
- `POST /admin/content` — Save/update launch content
- `POST /admin/upload-image` — Upload launch card image
- `GET /admin/saw-it` — List email submissions
- `POST /admin/send-gallery-emails` — Send gallery emails

### Admin UI
- `/admin-ui/` — Self-contained admin dashboard (served same-origin)

## Auth

Uses simple auth codes (like amenities-backend) via `X-Auth-Code` header.
No sessions, no CSRF tokens, no cross-origin cookie issues.

## LL2 API version monitor

The backend talks to a **pinned** Launch Library 2 (TheSpaceDevs) API version
(`https://ll.thespacedevs.com/2.3.0` by default). A scheduled monitor runs
automatically — **no interaction required** — to catch the case where that
version is deprecated/removed or a newer version is published.

- **Schedule:** daily at 7:00 AM Eastern (`LL2_VERSION_CHECK_CRON` to override),
  plus once at startup.
- **What it checks:** that the pinned version's `/launches/upcoming/` endpoint
  still returns `2xx`, any `Sunset`/`Deprecation`/`Warning` headers, and whether
  the API host advertises a newer version than the one we're pinned to.
- **How you find out:** results are written to the server logs. If
  `LL2_ALERT_WEBHOOK_URL` is set (Slack/Discord/Teams incoming webhook), problems
  are also pushed there so you get an active notification. You can also check the
  latest result on demand at any time via `GET /api/ll2-status`.

When the monitor flags a newer version or a deprecation, the fix is a code
change: bump the version in `routes/api.js` (`LL2_BASE`) and the frontend
fallbacks, then redeploy.
