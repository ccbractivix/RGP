#!/usr/bin/env python3
"""Autonomous VLC playback agent for the RGP theater schedule."""

from __future__ import annotations

import argparse
import json
import logging
import re
import signal
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, Optional
from urllib.error import URLError
from urllib.request import urlopen

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover - Monterey Python 3 normally has zoneinfo.
    ZoneInfo = None


IMDB_RE = re.compile(r"tt\d{7,8}", re.IGNORECASE)


def load_config(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        config = json.load(f)
    config.setdefault("poll_seconds", 30)
    config.setdefault("fullscreen", True)
    config.setdefault("stop_at_end", True)
    config.setdefault("take_control_of_vlc", True)
    config.setdefault("recursive_search", True)
    config.setdefault("media_extensions", [".mp4", ".m4v", ".mov", ".mkv"])
    return config


def setup_logging(config: Dict[str, Any]) -> None:
    handlers = [logging.StreamHandler(sys.stdout)]
    log_file = config.get("log_file")
    if log_file:
        Path(log_file).expanduser().parent.mkdir(parents=True, exist_ok=True)
        handlers.append(logging.FileHandler(Path(log_file).expanduser(), encoding="utf-8"))
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=handlers,
    )


def fetch_json(url: str, timeout: int = 15) -> Dict[str, Any]:
    with urlopen(url, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def now_in_timezone(timezone_name: str) -> datetime:
    if ZoneInfo:
        return datetime.now(ZoneInfo(timezone_name))
    return datetime.now().astimezone()


def parse_show_time(show: Dict[str, Any], key: str, timezone_name: str) -> Optional[datetime]:
    value = show.get(key)
    if not show.get("date") or not value:
        return None
    raw = f"{show['date']} {str(value)[:8]}"
    try:
        dt = datetime.strptime(raw, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None
    if ZoneInfo:
        return dt.replace(tzinfo=ZoneInfo(timezone_name))
    return dt.astimezone()


def candidate_files(movie_folder: Path, recursive: bool, extensions: Iterable[str]) -> Iterable[Path]:
    wanted = {ext.lower() for ext in extensions}
    iterator = movie_folder.rglob("*") if recursive else movie_folder.iterdir()
    for path in iterator:
        if path.is_file() and path.suffix.lower() in wanted:
            yield path


def find_movie_file(movie_folder: Path, imdb_id: str, config: Dict[str, Any]) -> Optional[Path]:
    imdb_id = imdb_id.lower()
    for path in candidate_files(
        movie_folder,
        bool(config.get("recursive_search", True)),
        config.get("media_extensions", []),
    ):
        match = IMDB_RE.search(path.name)
        if match and match.group(0).lower() == imdb_id:
            return path
    return None


class VlcController:
    def __init__(self, config: Dict[str, Any]) -> None:
        self.config = config
        self.process: Optional[subprocess.Popen] = None

    def stop(self) -> None:
        if self.process and self.process.poll() is None:
            logging.info("Stopping VLC process")
            self.process.terminate()
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.process.kill()
        self.process = None
        if self.config.get("take_control_of_vlc"):
            subprocess.run(
                ["osascript", "-e", 'tell application "VLC" to quit'],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )

    def play(self, file_path: Path) -> None:
        self.stop()
        args = [str(Path(self.config["vlc_executable"]).expanduser())]
        if self.config.get("fullscreen"):
            args.append("--fullscreen")
        args.extend(["--play-and-exit", "--no-video-title-show", str(file_path)])
        logging.info("Starting VLC: %s", file_path)
        self.process = subprocess.Popen(args)


def active_show(schedule: Dict[str, Any], config: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    timezone_name = schedule.get("timezone") or "America/New_York"
    current = now_in_timezone(timezone_name)
    active = []
    for show in schedule.get("shows", []):
        if show.get("blockedByClosure"):
            continue
        library_id = str(show.get("libraryId", ""))
        if not IMDB_RE.fullmatch(library_id):
            continue
        start = parse_show_time(show, "startTime", timezone_name)
        end = parse_show_time(show, "endTime", timezone_name)
        if not start:
            continue
        if not end and show.get("runtimeMin"):
            end = start + timedelta(minutes=int(show["runtimeMin"]))
        if not end:
            continue
        if end <= start:
            end = end + timedelta(days=1)
        if start <= current < end:
            active.append((start, show))
    if not active:
        return None
    active.sort(key=lambda item: item[0], reverse=True)
    return active[0][1]


def run(config_path: Path) -> int:
    config = load_config(config_path)
    setup_logging(config)

    movie_folder = Path(config["movie_folder"]).expanduser()
    if not movie_folder.exists():
        logging.error("Movie folder does not exist: %s", movie_folder)
        return 2

    player = VlcController(config)
    current_show_key = None
    missing_logged = set()

    def shutdown(_signum: int, _frame: Any) -> None:
        logging.info("Shutdown requested")
        player.stop()
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    logging.info("Theater player started")
    while True:
        try:
            schedule = fetch_json(config["schedule_url"])
            show = active_show(schedule, config)
            if not show:
                if current_show_key and config.get("stop_at_end"):
                    player.stop()
                    current_show_key = None
                time.sleep(int(config["poll_seconds"]))
                continue

            show_key = f"{show.get('date')} {show.get('startTime')} {show.get('libraryId')}"
            if show_key == current_show_key:
                time.sleep(int(config["poll_seconds"]))
                continue

            imdb_id = str(show["libraryId"])
            file_path = find_movie_file(movie_folder, imdb_id, config)
            if not file_path:
                if show_key not in missing_logged:
                    logging.error("No local file found for %s — %s", imdb_id, show.get("title", "Untitled"))
                    missing_logged.add(show_key)
                if current_show_key and config.get("stop_at_end"):
                    player.stop()
                    current_show_key = None
                time.sleep(int(config["poll_seconds"]))
                continue

            player.play(file_path)
            current_show_key = show_key
        except (URLError, TimeoutError, json.JSONDecodeError) as exc:
            logging.warning("Schedule check failed: %s", exc)
        except Exception:
            logging.exception("Unexpected player error")
        time.sleep(int(config["poll_seconds"]))


def main() -> int:
    parser = argparse.ArgumentParser(description="RGP Theater VLC playback agent")
    parser.add_argument("--config", default="config.json", help="Path to config JSON")
    args = parser.parse_args()
    return run(Path(args.config).expanduser())


if __name__ == "__main__":
    raise SystemExit(main())
