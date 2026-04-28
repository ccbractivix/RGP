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
| `CORS_ORIGIN` | No | Additional allowed CORS origins (comma-separated) |
| `PORT` | No | Server port (default: `3002`) |
| `NODE_ENV` | No | Set to `production` for SSL database connections |

## API Routes

### Public (`/api`)
- `GET /api/content` — All CMS content
- `GET /api/content/:launchId` — Single launch content
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
