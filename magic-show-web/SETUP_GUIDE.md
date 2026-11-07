# Free Magic Show: Reservations and Check-in

## Deploy

Create a new PostgreSQL database and a Node web service for `magic-show-backend`.
Use `npm ci --prefix magic-show-backend` as the build command and
`npm start --prefix magic-show-backend` as the start command, with the repository
root as the service root. The backend uses `shared/rooms.js`, so do not deploy
only the backend directory.

Set `DATABASE_URL` to the new database connection string, `NODE_ENV=production`,
and optionally `CORS_ORIGIN` to additional frontend origins (comma-separated).
The GitHub Pages origin is already allowed. The default port is 3009; the hosting
provider's `PORT` takes precedence. Tables are created automatically at startup.
Check `/health` after deployment. Keep regular PostgreSQL backups.

The backend serves both apps directly at `/index.html` and `/check-in.html`;
leave their `api-url` meta tags empty to use this same-origin setup. To use GitHub
Pages instead, set the `api-url` meta tag **in both HTML pages** to the actual
HTTPS backend URL, then open `magic-show-web/index.html` or
`magic-show-web/check-in.html` on Pages. No assumed hosting URL is hard-coded.

**Open access:** there is no access code or authentication, by request. Anyone
who can reach the API can read guest names and room numbers and modify records.
CORS is not access control. Use a private network or hosting-level access
restriction if these records must not be publicly accessible. This tool does
not provision a hosting service or database itself.

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
