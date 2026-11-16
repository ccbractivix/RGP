# Theater backend

## Weekly print schedule

In the schedule dashboard, **Update Print Schedule** publishes a black-and-white,
US Letter (8.5 x 11 inch, portrait) staff reference PDF. It always uses the most recent
Monday through the following Sunday in `America/New_York`, not the week selected
in the editor. Save any schedule edits before updating the PDF.

**View Current Print Schedule** opens the last published PDF at
`/api/schedule/print`. Print at actual size (100%) on letter paper. The PDF includes
all seven days, closures and reopening information, start and estimated end times,
titles, age ratings, and an updated timestamp. Live events are marked `LIVE`.
Notes, extra title/tagline lines, edition labels, genres, release years, IMDb
scores/links, ticket links, posters, QR codes, and promotional content are omitted
from print only; the online schedule is unchanged.

Publishing requires the existing admin login and CSRF token
(`POST /admin/print-schedule`); viewing the PDF is public. The PDF is stored in the
existing PostgreSQL `settings` table under `print_schedule_pdf`, so it survives
backend restarts. It changes only when the update button is pressed; updating the
website or nightly jobs does not replace it. Before first publication, the view
link explains that a schedule must be generated.

The compact chronological table uses readable 10-point title text and targets one
page for ordinary weeks. Busy schedules and long titles continue onto additional
pages with repeated column headings and day labels; no showing or title is dropped
to force a single page. Each page includes the week dates and updated timestamp.
If publication fails, the previous PDF is preserved.

Run the focused backend tests with `npm test`.
