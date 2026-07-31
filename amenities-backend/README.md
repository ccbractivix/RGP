# Amenities Backend

Express/Node.js API for the Resort Amenities Tracker.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AMENITY_CODES` | Yes | Comma-separated 4-digit auth codes for team members |
| `PORT` | No | Server port (default: 3001) |
| `NODE_ENV` | No | Set to `production` for SSL and secure defaults |
| `CORS_ORIGIN` | No | Additional allowed origins (comma-separated) |
| `AUDIO_PLAYER_TOKEN` | For remote player | Shared token used by the Mac Mini Python player when polling commands |
| `AUDIO_PLAYER_DEFAULT_ID` | No | Default player ID used by admin actions when a player ID is not supplied |

## Generating Auth Codes

Generate 15 random 4-digit codes:

```bash
node -e "const c=[]; while(c.length<15){const n=String(Math.floor(1000+Math.random()*9000)); if(!c.includes(n))c.push(n)} console.log(c.join(','))"
```

Copy the output into the `AMENITY_CODES` environment variable.

## Deployment (Render)

1. Create a new **Web Service** on Render
2. Set **Root Directory** to `amenities-backend`
3. Set **Build Command** to `npm install`
4. Set **Start Command** to `npm start`
5. Add all required environment variables
6. Update the `api-url` meta tags in `amenities-web/*.html` with the deployed URL

## API Endpoints

### Public

- `GET /api/status` — Returns all amenity statuses with server time
- `GET /health` — Health check

### Admin (requires `X-Auth-Code` header)

- `POST /admin/verify` — Verify an auth code (no auth required)
- `GET /admin/status` — Get all amenity statuses
- `POST /admin/close/:id` — Close an amenity `{ minutes: number | null }`
- `POST /admin/open/:id` — Reopen an amenity
- `POST /admin/update-now/:id` — Extend short closure by 15 min
- `POST /admin/lightning` — Lightning closure `{ minutes: number | null }`
- `POST /admin/lightning/clear` — Clear all lightning closures
- `GET /admin/player/schedule?playerId=mac-mini` — Load the saved player schedule
- `PUT /admin/player/schedule` — Save schedule and queue `reload_schedule`
- `POST /admin/player/command` — Queue a player command
- `GET /admin/player/commands?playerId=mac-mini` — Inspect recent player commands

### Player API (requires `X-Player-Token` and `X-Player-Id`)

- `POST /player/register` — Register/update player metadata and receive current schedule
- `GET /player/commands` — Poll queued commands
- `POST /player/commands/:id/ack` — Mark a command `completed`, `failed`, or `ignored`
- `GET /player/schedule` — Load the latest schedule for the current player

## Recommended Player Polling Flow

1. Python player starts and calls `POST /player/register`
2. Player polls `GET /player/commands` every few seconds
3. When a command is handled, player calls `POST /player/commands/:id/ack`
4. When schedule changes, admin saves schedule here and the backend queues `reload_schedule`

## Supported Player Command Types

- `play_file_now`
- `pause_rotation`
- `resume_rotation`
- `start_lightning_mode`
- `clear_lightning_mode`
- `reload_schedule`

### Example schedule payload

```json
{
  "timezone": "America/New_York",
  "rotation": {
    "enabled": true,
    "minIntervalMinutes": 30,
    "maxIntervalMinutes": 90,
    "files": ["announcement-a.mp3", "announcement-b.mp3", "announcement-c.mp3"]
  },
  "scheduledEvents": [
    { "time": "20:00", "command": "play_file_now", "payload": { "audioFile": "bar-last-call-1.mp3" } },
    { "time": "22:00", "command": "play_file_now", "payload": { "audioFile": "pool-close-1.mp3" } }
  ]
}
```
