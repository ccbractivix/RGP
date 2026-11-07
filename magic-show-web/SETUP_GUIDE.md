# Free Magic Show: Reservations and Check-in

## Deploy on Render: step-by-step

Magic Show runs inside the existing **Express Checkout Web Service** and uses
its PostgreSQL database. No separate Render service, database, Static Site,
Docker, persistent disk, or manual migration is needed. Both apps share the
service's availability and deploy together.

**Open access:** there is no access code or authentication, by request. Anyone
who can reach the API can read guest names and room numbers and modify records.
CORS is not access control. Use a private network or hosting-level access
restriction if these records must not be publicly accessible. This tool does
not provision a hosting service or database itself. Decide whether this access
model is acceptable **before entering real guest information**.

### Step 1: Prepare the existing service

1. Sign in to [Render](https://render.com) and open the existing Express
   Checkout **Web Service**, not its database.
2. Ensure its selected repository branch contains `checkout-backend/`,
   `magic-show-backend/`, `magic-show-web/`, and `shared/`, including these
   integration changes. Push them to that branch before deploying.
3. Keep the existing `DATABASE_URL`, `CHECKOUT_CODES`, `GITHUB_TOKEN`, and other
   Checkout settings. Magic Show uses the same database connection; its tables
   are separate and Checkout's daily clear does not remove reservations.
4. Check that the database user can create tables and indexes. Startup creates
   `magic_shows`, `magic_reservations`, and the reservation index automatically.
   Treat `DATABASE_URL` as a password; never publish it or commit it to GitHub.
5. Schedule the deployment when a brief interruption to **both** apps is
   acceptable, and confirm you have a usable database backup.

### Step 2: Update the Web Service settings

In the Checkout service's **Settings**, update the following. Dashboard labels
may vary slightly. Preserve the existing service name, region, branch, and plan.

| Setting | Value |
|---|---|
| Runtime / Language | Node |
| Root Directory | **Leave blank** to use the repository root |
| Build Command | `npm ci --prefix checkout-backend && npm ci --prefix magic-show-backend` |
| Start Command | `npm start --prefix checkout-backend` |
| Health Check Path | `/health` (under advanced settings, if shown) |

**Do not set Root Directory to either backend directory.** Checkout imports
Magic Show and the shared room data from sibling directories. Both `npm ci`
commands are required because each backend has its own dependencies. There is
no frontend build command.

### Step 3: Check environment variables and deploy

In the existing service's **Environment** settings, retain its Checkout
variables and verify:

| Key | Value | Required? |
|---|---|---|
| `DATABASE_URL` | Existing Checkout PostgreSQL connection string | Yes |
| `NODE_ENV` | `production` | Yes; enables the backend's production database SSL configuration |
| `CORS_ORIGIN` | Additional frontend origins, separated by commas | Only for additional frontend hosts; see Step 6 |

Do not replace Checkout's database URL with the local-development example.
Do not upload a `.env` file to Render or commit one to the repository.

**Leave `PORT` unset in your custom variables.** Render supplies it, and the
server uses that value automatically. Port `3005` is Checkout's local fallback.
No additional Magic Show access-code or API-key variable is required.

1. Save the settings and deploy the branch containing these changes. If needed,
   select **Manual Deploy → Deploy latest commit**.
2. Watch the logs for both dependency installations and `Checkout schema ready`,
   `Magic show schema ready`, and `Checkout backend running on port ...`.
   The service will not listen if either schema initialization fails.
3. Copy the existing Checkout service's public HTTPS URL from Render. In the
   following steps replace `YOUR-SERVICE` with its actual hostname.

### Step 4: Verify the service and database

1. Open `https://YOUR-SERVICE.onrender.com/health` in a browser. You should see:

   ```json
   {"status":"ok"}
   ```

2. Open `https://YOUR-SERVICE.onrender.com/magic-show/api/shows/2026-11-12`. This is an
   example Thursday; you can substitute another date in `YYYY-MM-DD` format,
   but it must be a Thursday. For a date without reservations, expect:

   ```json
   {
     "showDate": "2026-11-12",
     "reservations": [],
     "scoreboard": {
       "capacity": 53,
       "reserved": 0,
       "checkedIn": 0,
       "available": 53,
       "oversold": 0,
       "remaining": 53,
       "overCapacity": 0,
       "awaiting": 0
     }
   }
   ```

   `/health` confirms the web server responds; it does **not** query the
   database on each request. The show endpoint also verifies database reads.
   Existing reservations will change the response above.
3. Open `https://YOUR-SERVICE.onrender.com/magic-show/index.html` for the
   reservations desk and `https://YOUR-SERVICE.onrender.com/magic-show/check-in.html`
   for the door. `/magic-show/` also opens the reservations page.
4. Before using real guest data, select a Thursday and create a clearly labeled
   test reservation with a valid room and two seats. Open the check-in page on
   a second device, select the same date, and confirm the reservation appears.
5. Check in one guest and confirm both pages reflect the change after refreshing
   (automatic refresh is every ten seconds). Correct the check-in back to zero,
   then cancel the test reservation to remove it.
6. Open the existing Checkout guest and operator pages and verify their usual
   functionality. Checkout API URLs and its `/health` endpoint are unchanged.

### Step 5: Use the pages directly from Render (simplest option)

Bookmark the reservations URL on the desk computer and the check-in URL on
staff phones. Both devices must use this same backend and the same show date.

Leave the `api-url` meta tags empty in **both** HTML files:

```html
<meta name="api-url" content="">
```

This makes each page call the backend serving it. No source-code URL change or
extra CORS setting is needed for this setup, and Render serves the shared room
script at `/shared/rooms.js`.

### Step 6: Optional - host the pages on GitHub Pages instead

Skip this step if you will use the Render-hosted pages.

1. Edit `magic-show-web/index.html` and `magic-show-web/check-in.html`.
   In **both files**, replace the empty `api-url` tag with your backend's
   HTTPS base URL **including `/magic-show`**, but without `/api`, `/index.html`,
   or `/check-in.html`:

   ```html
   <meta name="api-url" content="https://YOUR-SERVICE.onrender.com/magic-show">
   ```

2. Commit and push those changes to the branch used by your GitHub Pages
   deployment, then wait for Pages to finish deploying.
3. Open the reservations and check-in pages at:

   ```text
   https://ccbractivix.github.io/RGP/magic-show-web/index.html
   https://ccbractivix.github.io/RGP/magic-show-web/check-in.html
   ```

   These addresses assume the repository's Pages site is enabled at its default
   project URL. Use your actual Pages URL if it has a different configuration.
4. The backend already allows the origin `https://ccbractivix.github.io`.
   For a custom frontend domain, set `CORS_ORIGIN` in Render to its origin,
   for example `https://staff.example.com`. An origin is the scheme and hostname
   (and port, if nonstandard), **not** a URL path such as `/RGP/magic-show-web/`.
   Multiple additional origins can be comma-separated. Save and redeploy after
   changing this variable.
5. Repeat the two-device check from Step 4 using the Pages URLs.

### Step 7: Keep the deployment running and data safe

1. Confirm Render's auto-deploy setting matches your intended workflow. When
   enabled, pushes to the selected branch can redeploy the service. Otherwise,
   use **Manual Deploy → Deploy latest commit** when you want an update.
2. Keep `DATABASE_URL` pointing to the same database during updates.
   Reservations live in PostgreSQL, not the service filesystem; restarting or
   redeploying the web service does not erase them. Creating a replacement
   database and changing the URL does not transfer existing reservations.
3. Set up regular PostgreSQL backups using the options supported by your
   database plan or your own `pg_dump` process, and verify that you can restore
   them. Past shows are not automatically erased.
4. If you use a sleeping web service plan, open the app before staff need it
   and wait for a successful refresh. Cold starts can delay the first request;
   do not rely on a stale scoreboard during check-in. A non-sleeping plan is
   preferable for live operations.

### Troubleshooting

| Symptom | What to check |
|---|---|
| Repository is missing in Render | Grant the Render GitHub app access to `ccbractivix/RGP`, then retry the repository picker. |
| Build cannot find a backend `package.json` | Leave Root Directory blank, use the exact build command above, and verify the selected branch contains both backends. |
| `Cannot find module '../shared/rooms'`, missing pages, or missing room picker | Leave Root Directory blank and deploy the full repository, including `shared/` and `magic-show-web/`. |
| `Failed to initialise schema` in logs | Read the following database error. Check `DATABASE_URL`, database availability, matching region for an internal URL, and `NODE_ENV=production`. Both apps are unavailable until startup succeeds. |
| Database permission error during startup | The database user must be allowed to create the tables and index in `db/schema.sql`. Use the credentials from the Render database connection details. |
| Render reports no open port | Check for startup/database errors first. Use the exact start command and let Render supply `PORT`; the server listens only after table initialization. |
| `/health` works but the show endpoint returns a server error | Check service logs and database availability. The health endpoint is not a continuous database check. |
| Show endpoint rejects the date | Use a real Thursday in `YYYY-MM-DD` format. Other weekdays are rejected. |
| Page asks you to set `api-url` | For GitHub Pages, configure the backend base URL including `/magic-show` in both HTML files and deploy them. For empty tags, open the pages from the Render service instead. |
| GitHub Pages reports a connection failure | Verify the configured HTTPS backend URL, then open its health and show endpoints directly. For a custom domain, check `CORS_ORIGIN` contains the frontend origin without a path. |
| Counts are stale or the first request times out | Wait for a sleeping service to wake, then use **Refresh**. Check service logs if requests continue failing. |
| Desk and phone show different reservations | Confirm both pages use the same backend URL and Thursday date; refresh both. |

For deployment failures, start with the Render service's **Logs** view. Do not
delete or recreate the database as a troubleshooting shortcut: that can lose
reservation data.

## Reservations desk (desktop)

Select the Thursday show date. The default is the next Thursday in Eastern time,
including tonight when opened on a Thursday. Each week has separate records;
past shows can be reviewed and are not automatically erased.

Enter first and last name, select a room, and enter the seats requested. The room
modal uses the same building, room, and A/B/A+B choices as Express Checkout.
Save the reservation. All shows are free, at 7 pm Eastern, general admission,
with 53 physical seats and no seat assignments.

The scoreboard shows available seats until 53 are reserved, then the number
oversold. Overselling does not block reservations. Search by name or room, or
use the room modal to filter. Edit reservations to correct details or seat
counts. Cancellation removes a reservation after confirmation; checked-in
guests must first be removed from the check-in count.

## Check-in (smartphone)

Open `check-in.html`, verify the show date, then find the reservation in the
last-name-sorted list. Search by name or use **Select room** to filter with the
same room modal.

Tap **Check in**, enter only the number arriving now, and confirm. The rest of
the party can check in later. **Correct check-in** subtracts mistaken admissions;
it does not cancel the reservation. **Edit** can update names, room, or seats,
including adding seats before admitting extra guests.

The sticky scoreboard shows physical seats remaining, guests checked in,
reserved guests still to arrive, and reservations oversold. Reservation totals
do not consume physical seats until guests check in. Above 53 admitted guests,
staff must explicitly authorize a capacity override; the scoreboard then shows
how many have been admitted over capacity.

Both apps refresh every ten seconds while visible and immediately after a
change. Use **Refresh** for an immediate update. Failed connections are reported
as stale; do not rely on stale counts. Concurrent changes to the same reservation
are rejected instead of overwritten: refresh, reopen the reservation, and retry.
Concurrent arrivals are serialized per show so an over-capacity admission
cannot bypass the override requirement.

## Local operation and tests

Copy `magic-show-backend/.env.example` to `magic-show-backend/.env`, configure
a local PostgreSQL database, then run:

```sh
cd magic-show-backend
npm ci
npm start
```

Open `http://localhost:3009/` or `http://localhost:3009/check-in.html`.
Run `npm test` for the domain tests. To also run PostgreSQL-backed API tests,
set `MAGIC_SHOW_TEST_DATABASE_URL` to a dedicated test database:

```sh
MAGIC_SHOW_TEST_DATABASE_URL=postgres://localhost/magic_show_test npm test
```

Integration tests create and remove their own schema in that database. They
exercise persistence, weekly isolation, editing/cancellation, partial arrivals,
corrections, version conflicts, and simultaneous admissions at the capacity
boundary.
