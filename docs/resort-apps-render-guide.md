# Resort apps: Render deployment and team access

This consolidates Express Checkout and Magic Show into `checkout-backend`.
Keep the existing Render service and PostgreSQL database. Games remain in
`ccbractivix/games`; no games or game APIs are deployed by this change.

## 1. Before changing Render

1. Arrange a maintenance window: checkout and Magic Show deploy together.
2. Record the service's current branch, root directory, build/start commands,
   health check path, and environment variable names in your private operations
   records. Do not copy secrets into GitHub issues, source code, or this guide.
3. Obtain a database backup using the database's Render recovery/export
   facilities, if available on its plan, or a PostgreSQL `pg_dump` from a trusted
   computer. Confirm you know how to restore it before proceeding.
4. Export the current checkout CSV through the existing operator dashboard.
5. Merge the reviewed changes into the branch Render deploys. Do not deploy
   an unfinished draft. Keep the existing database and service; do not create
   replacements or delete tables.

## 2. Set the environment variables

Open Render, select the existing **checkout-backend Web Service**, and open
**Environment**. Do not select the PostgreSQL database instead.

| Variable | Action |
|---|---|
| `DATABASE_URL` | Keep the existing PostgreSQL connection string unchanged. |
| `NODE_ENV` | Set to `production`. |
| `STAFF_ACCESS_CODE` | Set one long, hard-to-guess shared staff code privately. |
| `CHECKOUT_CODES` | Keep during transition if needed. Once `STAFF_ACCESS_CODE` is set, it takes precedence; old codes no longer work. |
| `CORS_ORIGIN` | Keep existing additional frontend origins. GitHub Pages at `https://ccbractivix.github.io` is already allowed. |
| `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_BRANCH` | Preserve current checkout archive settings. Review the archive warning below. |
| `PORT` | Do not add a custom value. Render supplies it. |

Save the settings. If Render offers save-without-deploy, use it until the build
settings below are also ready. Missing both staff-code settings stops startup
rather than exposing staff APIs.

**Archive warning:** the existing daily checkout process exports names,
villas, and signatures to the configured GitHub repository and clears checkout
records at 4 pm Eastern. This overhaul does not change that behavior. Do not
archive guest information into a publicly readable repository. Review your
existing archive destination and token privately before accepting real data.
Without `GITHUB_TOKEN`, the existing process skips archival but still clears
checkout records. Magic Show reservations are not cleared.

## 3. Update Build & Deploy

Open **Settings -> Build & Deploy** on that same Web Service. Edit and save:

| Setting | Value |
|---|---|
| Repository | Existing `ccbractivix/RGP` connection |
| Branch | The branch containing the reviewed changes, normally `main` |
| Runtime | Node |
| Root Directory | Completely empty |
| Build Command | `npm ci --prefix checkout-backend` |
| Start Command | `npm start --prefix checkout-backend` |
| Health Check Path | `/health` |

To clear Root Directory, click **Edit**, delete its contents, and save the
empty field. Do not enter `/` or `.`. The full repository is required for web
pages and shared assets. **The second Magic Show dependency installation is
no longer needed**: its implementation is inside checkout-backend.

Preserve the service's hostname, region, plan, and database connection.
If Build Filters are configured, include `checkout-backend/**`,
`checkout-web/**`, `magic-show-web/**`, `shared/**`, and `resort-web/**`,
or remove path filtering so shared changes trigger deployments.

## 4. Deploy

1. Select **Manual Deploy -> Deploy latest commit**.
2. Watch the build logs for a successful dependency installation.
3. Watch runtime logs for migration names on the first deployment, followed by
   `Resort apps database ready (checkout + magic show)` and
   `Resort apps backend running on port ...`.
4. Wait until Render reports the service is live.
5. Startup applies tracked, transactional migrations automatically. Existing
   checkout and reservation tables are retained; no manual SQL is required.

If startup fails, use the first error above any npm usage-help text. Missing
lockfile usually means the root directory is wrong. Missing shared assets
means the full repository was not deployed. Database or staff-code errors
must be fixed in Environment; do not weaken authentication to bypass them.

## 5. Verify before distributing links

Replace `YOUR-SERVICE` below with the existing Render hostname.

1. Open `https://YOUR-SERVICE/health`; expect `{"status":"ok"}`.
2. Open `https://YOUR-SERVICE/`; check the guest and staff links.
3. Open `/staff/` in a private browser window. Enter an incorrect code and
   confirm rejection, then sign in with the shared code.
4. Open checkout operations and housekeeping from the launcher. Confirm
   current records are present and CSV export works.
5. Open Magic Show reservations and check-in. Confirm existing reservations,
   seating counts, edits, and room/unit preselection.
6. In another private browser without signing in, open
   `/magic-show/api/shows/2026-11-12` and `/api/checkouts/housekeeping`.
   Both must return HTTP 401 instead of guest data.
7. Check `/checkout/` without staff sign-in. Guest checkout stays public.
   If doing an end-to-end submission, use a coordinated test because it will
   create a real checkout record and notify the housekeeping workflow.
8. Confirm `/checkout-web/` also opens; existing GitHub Pages checkout links
   still use their configured Render API URL.

## 6. Give the team access

Distribute `https://YOUR-SERVICE/staff/` and the staff code through your
normal private staff channel. Staff do not need GitHub or Render accounts.
The same code protects checkout operations, housekeeping, and Magic Show.

The browser stores the code in session storage, not in the URL. It is reused
within the same origin and browser-tab session; another tab or GitHub Pages
origin may ask again. Use **Sign out** on the launcher on shared devices and
close the tab. Rotate `STAFF_ACCESS_CODE` in Render and deploy/restart to
invalidate the previous code server-side. One shared code does not provide
individual accountability or per-person permissions.

For guests, use `https://YOUR-SERVICE/checkout/`. Existing QR targets remain
valid; change them only when ready. Hosted checkout pages choose their own
backend origin automatically, so there is no API URL source edit needed.

## 7. Games stay separate

Game frontend code and rules remain in `ccbractivix/games`. The room picker
is available at `/shared/room-picker/` and uses `/shared/rooms.js`; it submits
nothing by itself and does not authenticate guests.

For now the documented portable-copy approach still works. A versioned shared
package and game-specific API contracts remain follow-up work; there is no
generic game-data endpoint in this deployment. If a future games frontend
calls this service, configure its actual hosting origin in `CORS_ORIGIN`.
An origin contains scheme and hostname, not a repository path.
`https://ccbractivix.github.io/games/` uses the already allowed origin
`https://ccbractivix.github.io`. CORS is not authorization; never embed the
staff code in a public game.

## 8. Rollback

1. Stop distributing new links if verification fails.
2. Use Render's deployment history to redeploy the last known-good deployment
   if that option is available. Otherwise revert the reviewed code change
   through Git and redeploy that branch.
3. If rebuilding the old code, restore its build command including
   `npm ci --prefix magic-show-backend`; the old implementation needs it.
4. Preserve `CHECKOUT_CODES` for old-code rollback. Older code does not read
   `STAFF_ACCESS_CODE` and does not protect Magic Show/housekeeping, so do not
   assume the new access restrictions survive rollback.
5. These migrations add a tracking table and preserve app tables. Normally
   code rollback does not require restoring or deleting database tables.
   Restore a backup only for actual data damage, with a deliberate recovery
   plan accounting for records written since that backup.

One service remains one failure domain: a Render outage or failed startup
affects every app hosted here. Game frontend hosting remains independent.
