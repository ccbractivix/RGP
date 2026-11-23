# Portside LIVE! — Setup and staff guide

Portside LIVE! is a separate Resort Guest Portal page for the next 30 Eastern
calendar days of cruise ship departures, including port-of-call visits. It is
not live vessel tracking. Staff maintain the schedule by importing a CSV; it
does not download the port schedule automatically.

## Set up the service

1. Publish this repository on GitHub Pages as described in the
   [Operations Manual](../docs/OPERATIONS_MANUAL.md). The guest page will be
   `https://ccbractivix.github.io/RGP/portside/` after the changes are published.
2. Create a PostgreSQL database on Render, or use an existing RGP database.
   The backend creates its own `portside_` tables at startup.
3. Create a Render **Web Service** connected to this repository. Set its root
   directory to `portside-backend`, build command to `npm ci`, and start command
   to `npm start`.
4. Set these environment variables on the web service:

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | PostgreSQL connection URL |
   | `PORTSIDE_CODES` | One or more private staff access codes, separated by commas |
   | `NODE_ENV` | `production` on Render |
   | `CORS_ORIGIN` | Optional additional guest-page origins, comma-separated; GitHub Pages is already allowed |

5. Deploy the service and check `https://YOUR-SERVICE.onrender.com/health`.
   It should return `{"status":"ok"}`. Startup fails if the database URL or
   staff codes are missing, or the database cannot be initialized.
6. In `portside/index.html`, set the `api-base` meta tag's `content` to the
   actual backend URL, without a trailing slash. Publish that change. Until
   configured, the guest page explicitly reports that the schedule is not
   configured.
7. Open `https://YOUR-SERVICE.onrender.com/admin-ui/` and sign in with a
   `PORTSIDE_CODES` value. Import a schedule and visit the guest page to check
   dates, times, images, and notes. If the page is hosted somewhere other than
   GitHub Pages, add its origin to `CORS_ORIGIN`.
8. Link the guest page wherever guests access the Resort Guest Portal. A link
   is also provided on the `resort-web` launcher; that launcher must itself be
   deployed for the link to appear there.

## Update the schedule

1. Download the latest schedule from the
   [Port Canaveral cruise schedule](https://www.portcanaveral.com/cruise/cruise-ship-schedule)
   and prepare its CSV. Confirm you have permission to reuse and publish the
   data. This service does not fetch or scrape the port's website.
2. Open the backend's `/admin-ui/`, sign in, and select the CSV under **Replace
   schedule from CSV**. Confirm replacement.
3. Check the displayed coverage and compare sample cards with the source.
   Each import **replaces all previous visits**; it is not an incremental
   update. Photos and itinerary templates survive, as do per-sailing notes
   for a ship with the same departure date and time. If the time changes,
   re-enter that sailing's notes.
4. Repeat monthly, or sooner when schedules change. Check the coverage date:
   a file that ends within the next 30 days cannot populate the rest of the
   window. Gaps can also exist before the stated end date. Include later
   arrivals where available to support estimated return dates.

The supplied sample uses UTF-8 CSV without headers, seven columns in this exact
order: cruise line, ship, terminal, arrival, departure, visit type, address.
Dates look like `Thursday November 26, 2026 15:30` and must match their
weekday. Fields containing commas must be quoted. The recognized visit types
are `Home Port`, `Port Of Call`, and `Offload`. An optional header beginning
with `Cruise Line`, `Cruise Company`, or `Line` is accepted. Blank addresses
are allowed. Unknown formats, invalid dates and duplicate ship/departure rows
are rejected without changing the existing schedule. Do not upload the PDF as
a CSV; it needs to be converted and checked first.

## Photos and itineraries

1. Select a ship after importing the schedule. Upload a JPG, PNG, or WebP
   photo of up to 8 MB that the resort has permission to use. It is reused on
   all that ship's cards. Without a photo, an original ship illustration appears.
2. Enter a trip length in nights and itinerary notes to save a reusable
   template for the selected ship. Make separate templates for three- and
   four-night routes, for example. Leave notes blank and save to remove one.
3. For an exception, select an upcoming departure and save specific notes.
   Blank notes remove the override and let a matching template show again.

For home-port sailings only, the app estimates the return using the next
listed arrival of the same ship and calculates the number of nights from
calendar dates. It uses that duration to pick a template. A missing call,
repositioning, a route change, or a gap in the CSV can make both the return
and template wrong: staff must check them. If no later arrival is listed, the
return is unavailable and no duration template is selected. Other visit types
show the next listed arrival, not a purported return from the same voyage.
Sailing-specific notes override templates.

Cards show scheduled departures only, from now up to the beginning of the
30th subsequent Eastern calendar day (today plus the next 29 dates). Departure
times can change. Coverage and import time appear on the guest page; there is
no automatic source refresh or actual departure detection. An open guest page
checks the backend every five minutes and warns if that refresh fails.

## Troubleshooting

- **Cannot sign in:** check the Render `PORTSIDE_CODES` value and service logs.
  Admin access is code-based, not a full user account system.
- **CSV rejected:** check that every row has seven fields and the expected
  dates and visit types. Errors identify the row; a rejected import preserves
  the old data.
- **Missing ships or returns:** check the source file's date coverage, row
  gaps and ship spelling. Ship matching is case-insensitive but different
  names are not automatically reconciled.
- **Guest page cannot load:** check `api-base`, `/health`, the deployed
  backend, and CORS. There is no offline copy of the schedule.
- **Wrong image or route:** update the ship photo or itinerary; use a
  sailing-specific note for an exception. Verify rights before publishing.

The Portside logo and fallback illustration in `portside/assets/` are original
SVG graphics created for this service.
