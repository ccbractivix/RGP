# Disc Rentals Library — Installation Manual

This guide walks you through setting up the **rentals-backend** and **rentals-web** components from scratch.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Database Setup (PostgreSQL)](#2-database-setup-postgresql)
3. [Backend Setup (Render)](#3-backend-setup-render)
4. [Frontend Setup (GitHub Pages)](#4-frontend-setup-github-pages)
5. [Environment Variables Reference](#5-environment-variables-reference)
6. [Verifying the Installation](#6-verifying-the-installation)
7. [Ongoing Maintenance](#7-ongoing-maintenance)

---

## 1. Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 18 or newer | Only needed for local testing; Render installs it automatically |
| Git | Any | Already installed if you're working with this repo |
| PostgreSQL database | Any hosted instance | Render PostgreSQL (free tier) is recommended |
| OMDB API key | Free or paid | Sign up at https://www.omdbapi.com/ |
| Render account | Free tier works | https://render.com |
| GitHub repository | This repo | `ccbractivix/RGP` |

---

## 2. Database Setup (PostgreSQL)

### Option A — Use Render PostgreSQL (Recommended)

1. Log in to [Render](https://render.com) and click **New → PostgreSQL**.
2. Choose a name (e.g., `rentals-db`), region, and the **Free** plan.
3. Click **Create Database**.
4. When provisioning finishes, click on the database and copy the **External Database URL** (it starts with `postgres://…`). You will need this in Step 3.

> **Note:** The schema tables are created automatically the first time the backend starts. You do not need to run any SQL manually.

### Option B — Use an Existing PostgreSQL Instance

You can use any PostgreSQL database that the Render backend can reach. Simply note the connection string (`DATABASE_URL`).

---

## 3. Backend Setup (Render)

### 3a. Create the Web Service

1. In Render, click **New → Web Service**.
2. Connect your GitHub account (if not already) and select the **`ccbractivix/RGP`** repository.
3. Fill in the service settings:

| Setting | Value |
|---------|-------|
| **Name** | `rentals-backend` (or any name you like) |
| **Root Directory** | `rentals-backend` |
| **Environment** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `node server.js` |
| **Plan** | Free |

4. Click **Create Web Service**. Render will begin the first build.

### 3b. Add Environment Variables

After the service is created, go to **Environment** → **Environment Variables** and add the following:

| Key | Value | Required |
|-----|-------|----------|
| `DATABASE_URL` | Your PostgreSQL connection string | ✅ Yes |
| `OMDB_API_KEY` | Your OMDB API key | ✅ Yes |
| `ADMIN_CODES` | One or more 4-digit PINs, comma-separated | ✅ Yes |
| `OPERATOR_CODES` | One or more 4-digit PINs, comma-separated | ✅ Yes |
| `NODE_ENV` | `production` | ✅ Yes |
| `CORS_ORIGIN` | Leave blank (GitHub Pages origin is pre-allowed) | Optional |

**Example values:**
```
ADMIN_CODES=1234,5678
OPERATOR_CODES=9999,1111
```

> You can list multiple PINs per role separated by commas. Admin and Operator PINs can be different sets.

5. Click **Save** and redeploy. The backend will start, connect to the database, create the schema tables automatically, and log `Rentals schema ready`.

### 3c. Note the Backend URL

After the service is running, copy the public URL Render assigned to it — it looks like:
```
https://rentals-backend.onrender.com
```
You will need this in Step 4.

---

## 4. Frontend Setup (GitHub Pages)

The three HTML pages in `rentals-web/` are served as static files via GitHub Pages. No build step is required.

### 4a. Enable GitHub Pages

1. Go to the repository on GitHub: `ccbractivix/RGP`.
2. Click **Settings → Pages**.
3. Under **Source**, select **Deploy from a branch**.
4. Select the **`main`** branch and **`/ (root)`** folder.
5. Click **Save**.

After a minute, GitHub will publish the site. Your pages will be at:
```
https://ccbractivix.github.io/RGP/rentals-web/index.html
https://ccbractivix.github.io/RGP/rentals-web/operator.html
https://ccbractivix.github.io/RGP/rentals-web/admin.html
```

### 4b. Set the Backend URL in Each Page

Each HTML page contains a `<meta name="api-url">` tag near the top of the file. Update this tag in all three files to point to your Render backend URL:

**`rentals-web/index.html`** (line ~3):
```html
<meta name="api-url" content="https://rentals-backend.onrender.com">
```

**`rentals-web/operator.html`** (line ~3):
```html
<meta name="api-url" content="https://rentals-backend.onrender.com">
```

**`rentals-web/admin.html`** (line ~3):
```html
<meta name="api-url" content="https://rentals-backend.onrender.com">
```

Replace `https://rentals-backend.onrender.com` with your actual Render URL if it differs.

Commit and push the changes:
```bash
git add rentals-web/
git commit -m "chore: set backend URL in rentals-web pages"
git push
```

GitHub Pages will redeploy automatically within a minute.

---

## 5. Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Full PostgreSQL connection string | `postgres://user:pass@host:5432/dbname` |
| `OMDB_API_KEY` | OMDB API key for movie lookups | `abc12345` |
| `ADMIN_CODES` | Comma-separated 4-digit PINs for the admin panel | `1234,5678` |
| `OPERATOR_CODES` | Comma-separated 4-digit PINs for the operator panel | `9999` |
| `NODE_ENV` | Set to `production` on Render | `production` |
| `PORT` | HTTP port (Render sets this automatically) | `3002` |
| `CORS_ORIGIN` | Extra allowed CORS origins (comma-separated) | `https://my-custom-domain.com` |

> **Tip:** Operator codes can overlap with admin codes if you want one set of PINs to work for both panels.

---

## 6. Verifying the Installation

### Check the backend health endpoint
Open in a browser:
```
https://rentals-backend.onrender.com/health
```
You should see:
```json
{"status":"ok"}
```

### Check the public library page
Open:
```
https://ccbractivix.github.io/RGP/rentals-web/index.html
```
You should see the "Disc Rentals Library" page. If the library is empty, that is expected — add titles via the admin panel.

### Add your first title
1. Open the admin panel: `.../rentals-web/admin.html`
2. Enter your 4-digit admin PIN.
3. In the **Add Title** tab, select **Movie**, type a movie title, and click **Look Up**.
4. Confirm the OMDB result and click **Add to Library**.
5. Return to the public page and refresh — the movie should appear.

### Check operator panel
1. Open `.../rentals-web/operator.html`
2. Enter your 4-digit operator PIN.
3. You should see the library list.

---

## 7. Ongoing Maintenance

### Adding more copies of a title
1. In the admin panel, go to the **Library** tab.
2. Click on the title to expand it.
3. Click **+ Add Copy** — a new copy (x2, x3, etc.) will be created.

### Changing PINs
Update the `ADMIN_CODES` or `OPERATOR_CODES` environment variables in Render and redeploy.

### Updating the OMDB API key
Update the `OMDB_API_KEY` environment variable in Render and redeploy.

### Wake-up latency (Render free tier)
The Render free tier spins down services after 15 minutes of inactivity. The first request after a period of inactivity may take 30–60 seconds. This is expected behavior. Upgrading to a paid Render plan eliminates this.

### Backing up the database
Use `pg_dump` or the Render dashboard to take regular snapshots of the database.

---

*End of Installation Manual*
