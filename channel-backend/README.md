# Channel Backend

Express/Node.js backend for the TV Channel Management System. Manages channels, slides, breakthroughs, lightning alerts, and TV heartbeat monitoring.

## Setup

```bash
npm install
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `CHANNEL_CODES` | Yes | Comma-separated 4-digit admin codes (e.g., `1234,5678`) |
| `CORS_ORIGIN` | No | Additional allowed CORS origins (comma-separated) |
| `AMENITIES_API_URL` | No | Amenities backend URL for lightning polling (default: `https://amenities-web.onrender.com/api/status`) |
| `PORT` | No | Server port (default: `3003`) |
| `NODE_ENV` | No | Set to `production` for SSL database connections |

## Run

```bash
npm start
```

The server automatically creates all database tables and seeds default channels/slides on first start.

## API Overview

- **Public**: `/api/channels/:id`, `/api/channels/:id/alerts`, `/api/channels/:id/heartbeat`
- **Admin**: `/admin/verify`, `/admin/channels`, `/admin/slides`, `/admin/breakthroughs`, `/admin/heartbeats`, `/admin/lightning`

See `channel-web/USER_MANUAL.md` for complete API documentation.
