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
