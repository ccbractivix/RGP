# RGP Theater Player User Manual

## Quick start

1. Install VLC in `/Applications/VLC.app`.
2. Copy the `theater-player` folder to the Mac, preferably:
   `/Users/theater/TheaterPlayer`
3. Open Terminal and run:
   `cd /Users/theater/TheaterPlayer`
4. Run:
   `./install.sh`
5. Open `config.json` and set `movie_folder` to the folder that contains the local movie files.
6. Test the player manually:
   `python3 theater_player.py --config config.json`
7. Press `Control-C` to stop the manual test.
8. Start the automatic service:
   `./start.sh`
9. Restart the Mac once and confirm the player starts again by itself.

## What this does

The theater player is a small local Mac service. It checks `theater-backend` for the current playback schedule, finds the matching local movie file by IMDb ID, and launches VLC fullscreen when a movie is scheduled to play.

The backend schedule remains the source of truth. If the theater web schedule is changed at the last minute, the Mac picks up the change on its next schedule check.

## Naming convention

Use this format:

`[IMDB ID] Movie.Title.String-[year].mp4`

Example:

`[tt0114709] Toy.Story-[1995].mp4`

The player relies on the IMDb ID. The title text is for humans, so small differences in punctuation or spelling do not matter as long as the IMDb ID is correct.

## Recommended file format

Use local files that VLC can play smoothly on the older Mac:

- `.mp4` preferred
- 1080p H.264 preferred
- AAC audio preferred
- Avoid 4K, HDR, and HEVC/H.265 files when possible

## Configuration

The installer creates `config.json` from `config.example.json`.

Important settings:

- `schedule_url` — theater-backend playback endpoint.
- `library_api_base` — theater-backend library lookup endpoint used by the renamer.
- `movie_folder` — folder containing local movie files.
- `vlc_executable` — VLC command-line executable.
- `poll_seconds` — how often the Mac checks for schedule updates.
- `fullscreen` — launches VLC fullscreen.
- `stop_at_end` — stops VLC when the scheduled movie window ends.
- `take_control_of_vlc` — lets the service quit existing VLC playback before starting the scheduled movie.

## Installing

From the `theater-player` folder:

`./install.sh`

This creates:

`~/Library/LaunchAgents/com.rgp.theater-player.plist`

That LaunchAgent tells macOS to run the player automatically.

## Starting

Run:

`./start.sh`

The player starts immediately and continues running in the background.

## Stopping

Run:

`./stop.sh`

This stops the background service and quits VLC.

## Checking status

Run:

`./status.sh`

For logs, check:

- `theater-player.log`
- `logs/launchd.out.log`
- `logs/launchd.err.log`

## Daily use

1. Add or update movies in the theater admin system.
2. Add showtimes to the theater schedule.
3. Make sure the matching local movie file exists in the movie folder.
4. Leave the Mac logged in.
5. The player checks the backend periodically and starts VLC when scheduled.

Between movies, VLC is stopped and the desktop advertisement remains visible.

## File renamer

Run:

`python3 movie_renamer.py`

Recommended workflow:

1. Click **Choose** and select a movie file.
2. Paste the IMDb ID, such as `tt0114709`.
3. Click **Look Up**.
4. Confirm or edit the title and year.
5. Click **Rename File**.

The renamer asks theater-backend for the title and release year. If the movie is not in the theater library yet, type the title and year manually.

The renamer is intentionally based on a Choose File button instead of browser-style drag-and-drop. That is more reliable on this Mac because it avoids browser security limits and extra drag/drop dependencies.

## Schedule behavior

The player checks the playback schedule endpoint:

`/api/schedule/playback`

That endpoint returns movie showings for today and tomorrow using raw date/time values. The player ignores live events for VLC playback and only plays movie entries with IMDb-style IDs.

If a scheduled movie changes, the next poll sees the new schedule and follows it.

Playback starts on the first schedule check after the listed start time, usually within the `poll_seconds` window.

## Missing file behavior

If the schedule calls for a movie but no matching local file is found, the player logs an error and does not start VLC.

To fix it:

1. Confirm the IMDb ID in the theater library.
2. Rename the file so the filename contains that IMDb ID.
3. Confirm the file is inside `movie_folder`.
4. Wait for the next poll or restart the service.

## Reboot behavior

For autonomous operation:

1. Set the theater Mac to auto-login to the theater user.
2. Set macOS Energy Saver so the Mac does not sleep during operating hours.
3. Start the LaunchAgent with `./start.sh`.
4. Reboot once to confirm the agent comes back automatically.

## Updating the player

1. Stop the service:
   `./stop.sh`
2. Replace the files in the `theater-player` folder.
3. Keep your existing `config.json`.
4. Run:
   `./install.sh`
5. Start again:
   `./start.sh`
