#!/usr/bin/env python3
"""
Draft polling client for the amenities player API.

This client is designed for the Mac Mini audio player and implements the
register -> poll -> ack flow expected by amenities-backend.
"""

from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, Optional, Tuple


def env_int(name: str, default: int, minimum: int = 1) -> int:
  raw = os.getenv(name, "").strip()
  if not raw:
    return default
  try:
    value = int(raw)
    return max(value, minimum)
  except ValueError:
    return default


class MacMiniPollingClient:
  def __init__(self) -> None:
    self.base_url = os.getenv("AUDIO_PLAYER_API_BASE_URL", "http://localhost:3001").rstrip("/")
    self.player_token = os.getenv("AUDIO_PLAYER_TOKEN", "").strip()
    self.player_id = os.getenv("AUDIO_PLAYER_ID", "mac-mini").strip() or "mac-mini"
    self.player_name = os.getenv("AUDIO_PLAYER_NAME", "Mac Mini Audio Player").strip() or "Mac Mini Audio Player"
    self.player_version = os.getenv("AUDIO_PLAYER_VERSION", "draft-1").strip() or "draft-1"
    self.poll_seconds = env_int("AUDIO_PLAYER_POLL_SECONDS", 5, minimum=1)
    self.timeout_seconds = env_int("AUDIO_PLAYER_TIMEOUT_SECONDS", 10, minimum=1)
    self.command_limit = env_int("AUDIO_PLAYER_COMMAND_LIMIT", 20, minimum=1)
    self.play_command_template = os.getenv("AUDIO_PLAYER_PLAY_COMMAND_TEMPLATE", "").strip()
    self.audio_directory = Path(os.getenv("AUDIO_PLAYER_AUDIO_DIR", ".")).expanduser().resolve()
    self.cache_path = Path(
      os.getenv(
        "AUDIO_PLAYER_SCHEDULE_CACHE",
        str(Path.home() / ".rgp" / f"schedule-{self.player_id}.json"),
      )
    ).expanduser().resolve()
    self.rotation_paused = False
    self.lightning_mode = False
    self.running = True

    if not self.player_token:
      raise RuntimeError("AUDIO_PLAYER_TOKEN is required")

    self.cache_path.parent.mkdir(parents=True, exist_ok=True)

  @property
  def headers(self) -> Dict[str, str]:
    return {
      "Content-Type": "application/json",
      "X-Player-Token": self.player_token,
      "X-Player-Id": self.player_id,
    }

  def request_json(
    self,
    method: str,
    path: str,
    payload: Optional[Dict[str, Any]] = None,
    query: Optional[Dict[str, Any]] = None,
  ) -> Dict[str, Any]:
    url = self.base_url + path
    if query:
      url += "?" + urllib.parse.urlencode(query)
    body = None
    if payload is not None:
      body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, method=method, headers=self.headers, data=body)
    try:
      with urllib.request.urlopen(req, timeout=self.timeout_seconds) as res:
        charset = res.headers.get_content_charset() or "utf-8"
        raw = res.read().decode(charset)
        return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as err:
      raw = err.read().decode("utf-8", errors="replace")
      raise RuntimeError(f"HTTP {err.code} on {method} {path}: {raw}") from err
    except urllib.error.URLError as err:
      raise RuntimeError(f"Network error on {method} {path}: {err}") from err

  def register(self) -> None:
    payload = {
      "name": self.player_name,
      "version": self.player_version,
      "capabilities": {
        "commandTypes": [
          "play_file_now",
          "pause_rotation",
          "resume_rotation",
          "start_lightning_mode",
          "clear_lightning_mode",
          "reload_schedule",
        ],
        "platform": sys.platform,
      },
    }
    data = self.request_json("POST", "/player/register", payload=payload)
    schedule = data.get("schedule")
    if schedule is not None:
      self.write_schedule_cache(schedule)
      print("Registered player and cached initial schedule")
    else:
      print("Registered player (no schedule returned)")

  def load_schedule(self) -> Optional[Any]:
    data = self.request_json("GET", "/player/schedule")
    schedule = data.get("schedule")
    if schedule is None:
      return self.read_schedule_cache()
    self.write_schedule_cache(schedule)
    return schedule

  def write_schedule_cache(self, schedule: Any) -> None:
    self.cache_path.write_text(
      json.dumps({"updatedAt": time.time(), "schedule": schedule}, indent=2),
      encoding="utf-8",
    )

  def read_schedule_cache(self) -> Optional[Any]:
    if not self.cache_path.exists():
      return None
    try:
      payload = json.loads(self.cache_path.read_text(encoding="utf-8"))
      return payload.get("schedule")
    except (OSError, json.JSONDecodeError):
      return None

  def poll_commands(self) -> Dict[str, Any]:
    return self.request_json(
      "GET",
      "/player/commands",
      query={"limit": self.command_limit},
    )

  def acknowledge(
    self,
    command_id: Any,
    status: str,
    result_message: str,
    result_data: Optional[Dict[str, Any]] = None,
  ) -> None:
    payload: Dict[str, Any] = {
      "status": status,
      "resultMessage": result_message,
      "resultData": result_data or {},
    }
    self.request_json("POST", f"/player/commands/{command_id}/ack", payload=payload)

  def handle_command(self, command: Dict[str, Any]) -> Tuple[str, str, Dict[str, Any]]:
    command_type = command.get("commandType")
    payload = command.get("payload") or {}

    if command_type == "play_file_now":
      audio_file = str(payload.get("audioFile") or "").strip()
      if not audio_file:
        return "failed", "Missing audioFile in payload", {}
      return self.play_file_now(audio_file)

    if command_type == "pause_rotation":
      self.rotation_paused = True
      return "completed", "Rotation paused", {"rotationPaused": True}

    if command_type == "resume_rotation":
      self.rotation_paused = False
      return "completed", "Rotation resumed", {"rotationPaused": False}

    if command_type == "start_lightning_mode":
      self.lightning_mode = True
      return "completed", "Lightning mode started", {"lightningMode": True, "payload": payload}

    if command_type == "clear_lightning_mode":
      self.lightning_mode = False
      return "completed", "Lightning mode cleared", {"lightningMode": False}

    if command_type == "reload_schedule":
      schedule = self.load_schedule()
      if schedule is None:
        return "failed", "No schedule available from API or cache", {}
      return "completed", "Schedule reloaded", {"scheduleLoaded": True}

    return "ignored", f"Unsupported command type: {command_type}", {}

  def play_file_now(self, audio_file: str) -> Tuple[str, str, Dict[str, Any]]:
    audio_path = (self.audio_directory / audio_file).resolve()
    if not str(audio_path).startswith(str(self.audio_directory)):
      return "failed", "Unsafe audio path", {}
    if not audio_path.exists():
      return "failed", f"Audio file not found: {audio_file}", {"audioPath": str(audio_path)}

    if self.play_command_template:
      command = self.play_command_template.format(audio_file=audio_file, audio_path=str(audio_path))
      completed = subprocess.run(command, shell=True, check=False, capture_output=True, text=True)
      if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "").strip()
        return "failed", f"Playback command failed: {detail}", {"audioPath": str(audio_path)}
      return "completed", "Playback command executed", {"audioPath": str(audio_path), "mode": "template"}

    completed = subprocess.run(["afplay", str(audio_path)], check=False, capture_output=True, text=True)
    if completed.returncode != 0:
      detail = (completed.stderr or completed.stdout or "").strip()
      return "failed", f"afplay failed: {detail}", {"audioPath": str(audio_path)}
    return "completed", "Audio played", {"audioPath": str(audio_path), "mode": "afplay"}

  def run_once(self) -> None:
    response = self.poll_commands()
    commands = response.get("commands") or []
    if not commands:
      return

    for command in commands:
      command_id = command.get("id")
      if command_id is None:
        continue
      try:
        status, message, data = self.handle_command(command)
      except Exception as err:  # defensive: never drop an ack
        status, message, data = "failed", f"Unhandled error: {err}", {}
      self.acknowledge(command_id, status, message, data)
      print(f"Acked command {command_id}: {status} - {message}")

  def run(self) -> None:
    self.register()
    while self.running:
      try:
        self.run_once()
      except Exception as err:
        print(f"Polling error: {err}", file=sys.stderr)
      time.sleep(self.poll_seconds)


def main() -> int:
  client = MacMiniPollingClient()

  def _stop(_signum: int, _frame: Any) -> None:
    client.running = False

  signal.signal(signal.SIGINT, _stop)
  signal.signal(signal.SIGTERM, _stop)

  client.run()
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
