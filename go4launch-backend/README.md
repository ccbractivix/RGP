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
| `GO4LAUNCH_CODES` | Yes | Comma-separated admin auth codes (e.g. `1234,5678`) |
| `GITHUB_TOKEN` | For image uploads | GitHub personal access token |
| `GITHUB_REPO` | For image uploads | GitHub repo (e.g. `ccbractivix/RGP`) |
| `GITHUB_BRANCH` | No | Branch for image commits (default: `main`) |
| `SENDGRID_API_KEY` | For emails | SendGrid API key (requires Mail Send permission) |
| `SENDGRID_FROM` | For emails | Verified sender email address in your SendGrid account (required when `SENDGRID_API_KEY` is set) |
| `GO4LAUNCH_ARCHIVE_URL` | No | Public frontend URL (default: `https://ccbractivix.github.io/RGP/go4launch`) |
| `CHANNEL_API_URL` | For TV launch-card sync | Base URL for channel-backend admin API |
| `CHANNEL_ADMIN_CODE` | For TV launch-card sync | Valid channel-backend admin auth code |
| `GO4LAUNCH_TV_CARD_BASE_URL` | No | TV card URL base (default: `https://ccbractivix.github.io/RGP/go4launch/tv-launch-card.html`) |
| `GO4LAUNCH_LOCATION_IDS` | No | Comma-separated LL2 location IDs (default: `12,27`) |
| `CORS_ORIGIN` | No | Additional allowed CORS origins (comma-separated) |
| `PORT` | No | Server port (default: `3002`) |
| `NODE_ENV` | No | Set to `production` for SSL database connections |

## API Routes

### Public (`/api`)
- `GET /api/content` — All CMS content
- `GET /api/content/:launchId` — Single launch content
- `GET /api/launches` — Upcoming/recent LL2 launches (proxy + cache)
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
