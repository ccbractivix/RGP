# Theater backend

## Weekly print schedule

In the schedule dashboard, **Update Print Schedule** publishes a black-and-white,
single-page US Letter (8.5 x 11 inch, portrait) PDF. It always uses the most recent
Monday through the following Sunday in `America/New_York`, not the week selected
in the editor. Save any schedule edits before updating the PDF.

**View Current Print Schedule** opens the last published PDF at
`/api/schedule/print`. Print at actual size (100%) on letter paper. The PDF includes
all seven days, closures and reopening information, movie/event details without
posters, and the Resort Guest Portal QR code. IMDb, Parents' Guide, and ticket
labels remain clickable when viewed digitally.

Publishing requires the existing admin login and CSRF token
(`POST /admin/print-schedule`); viewing the PDF is public. The PDF is stored in the
existing PostgreSQL `settings` table under `print_schedule_pdf`, so it survives
backend restarts. It changes only when the update button is pressed; updating the
website or nightly jobs does not replace it. Before first publication, the view
link explains that a schedule must be generated.

The layout balances days across two chronological columns and adjusts type size
to fit. If unusually long titles or notes cannot fit at a readable minimum size,
publishing reports an error and preserves the previous PDF rather than clipping
content or adding a second page.

Run the focused backend tests with `npm test`.
