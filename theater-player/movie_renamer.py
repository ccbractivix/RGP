#!/usr/bin/env python3
"""Small Tkinter helper for renaming theater movie files by IMDb ID."""

from __future__ import annotations

import json
import re
from pathlib import Path
from tkinter import BOTH, LEFT, RIGHT, Button, Entry, Frame, Label, StringVar, Tk, filedialog, messagebox
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import urlopen


IMDB_RE = re.compile(r"^tt\d{7,8}$", re.IGNORECASE)


def app_dir() -> Path:
    return Path(__file__).resolve().parent


def load_config() -> dict:
    config_path = app_dir() / "config.json"
    if not config_path.exists():
        config_path = app_dir() / "config.example.json"
    with config_path.open("r", encoding="utf-8") as f:
        return json.load(f)


def sanitize_title(title: str) -> str:
    title = re.sub(r"[^\w\s.-]", "", title.strip())
    title = re.sub(r"\s+", ".", title)
    title = re.sub(r"\.+", ".", title)
    return title.strip(".") or "Untitled"


def fetch_library_entry(config: dict, imdb_id: str) -> dict:
    base = config.get("library_api_base", "https://theater-backend-qf1b.onrender.com/api/library").rstrip("/")
    with urlopen(f"{base}/{quote(imdb_id)}", timeout=15) as response:
        return json.loads(response.read().decode("utf-8"))


class RenamerApp:
    def __init__(self, root: Tk) -> None:
        self.root = root
        self.config = load_config()
        self.file_path = StringVar()
        self.imdb_id = StringVar()
        self.title = StringVar()
        self.year = StringVar()
        self.preview = StringVar(value="Choose a file and enter an IMDb ID.")

        root.title("RGP Theater Movie Renamer")
        root.geometry("720x280")

        self.row("Movie file", self.file_path, self.choose_file)
        self.row("IMDb ID", self.imdb_id, self.lookup)
        self.row("Title", self.title, None)
        self.row("Year", self.year, None)

        preview_frame = Frame(root, padx=12, pady=8)
        preview_frame.pack(fill=BOTH)
        Label(preview_frame, textvariable=self.preview, justify=LEFT, wraplength=680).pack(anchor="w")

        actions = Frame(root, padx=12, pady=8)
        actions.pack(fill=BOTH)
        Button(actions, text="Preview Name", command=self.update_preview).pack(side=LEFT)
        Button(actions, text="Rename File", command=self.rename_file).pack(side=RIGHT)

    def row(self, label: str, value: StringVar, command) -> None:
        frame = Frame(self.root, padx=12, pady=6)
        frame.pack(fill=BOTH)
        Label(frame, text=label, width=12, anchor="w").pack(side=LEFT)
        Entry(frame, textvariable=value).pack(side=LEFT, expand=True, fill=BOTH)
        if command:
            Button(frame, text="Choose" if label == "Movie file" else "Look Up", command=command).pack(side=RIGHT, padx=(8, 0))

    def choose_file(self) -> None:
        initial = self.config.get("movie_folder") or str(Path.home())
        filename = filedialog.askopenfilename(initialdir=initial)
        if filename:
            self.file_path.set(filename)
            self.update_preview()

    def lookup(self) -> None:
        imdb_id = self.imdb_id.get().strip()
        if not IMDB_RE.match(imdb_id):
            messagebox.showerror("Invalid IMDb ID", "Enter an IMDb ID like tt0114709.")
            return
        try:
            entry = fetch_library_entry(self.config, imdb_id)
        except HTTPError as exc:
            messagebox.showwarning("Not Found", f"The backend did not find {imdb_id}. Enter the title and year manually.\n\nHTTP {exc.code}")
            return
        except (URLError, TimeoutError) as exc:
            messagebox.showwarning("Lookup Failed", f"Could not reach the backend. Enter the title and year manually.\n\n{exc}")
            return
        self.title.set(entry.get("title", ""))
        self.year.set(str(entry.get("releaseYear", "")))
        self.update_preview()

    def target_path(self) -> Path:
        source = Path(self.file_path.get().strip()).expanduser()
        imdb_id = self.imdb_id.get().strip()
        title = sanitize_title(self.title.get())
        year = self.year.get().strip()
        suffix = source.suffix or ".mp4"
        year_part = f"-[{year}]" if year else ""
        return source.with_name(f"[{imdb_id}] {title}{year_part}{suffix}")

    def update_preview(self) -> None:
        try:
            target = self.target_path()
            self.preview.set(f"New name:\n{target.name}")
        except Exception:
            self.preview.set("Choose a file and enter an IMDb ID.")

    def rename_file(self) -> None:
        source = Path(self.file_path.get().strip()).expanduser()
        imdb_id = self.imdb_id.get().strip()
        if not source.exists() or not source.is_file():
            messagebox.showerror("Missing File", "Choose an existing movie file.")
            return
        if not IMDB_RE.match(imdb_id):
            messagebox.showerror("Invalid IMDb ID", "Enter an IMDb ID like tt0114709.")
            return
        if not self.title.get().strip():
            messagebox.showerror("Missing Title", "Look up the movie or enter a title manually.")
            return
        target = self.target_path()
        if target.exists() and target != source:
            messagebox.showerror("File Exists", f"This file already exists:\n{target}")
            return
        source.rename(target)
        self.file_path.set(str(target))
        self.update_preview()
        messagebox.showinfo("Renamed", f"Renamed to:\n{target.name}")


def main() -> int:
    root = Tk()
    RenamerApp(root)
    root.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
