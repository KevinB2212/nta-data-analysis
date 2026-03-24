from __future__ import annotations

import csv
import re
from pathlib import Path
from zipfile import ZipFile

DATE_RE = re.compile(r"^\d{8}$")
TIME_RE = re.compile(r"^\d{1,3}:\d{2}:\d{2}$")

REQUIRED_FILES = {
    "agency.txt",
    "routes.txt",
    "stops.txt",
    "trips.txt",
    "stop_times.txt",
    "calendar.txt"
}

OPTIONAL_FILES = {
    "calendar_dates.txt",
    "shapes.txt",
}

REQUIRED_COLUMNS = {
    "agency.txt": {"agency_name", "agency_url", "agency_timezone"},
    "routes.txt": {"route_id", "route_type"},
    "stops.txt": {"stop_id"},
    "trips.txt": {"trip_id", "route_id", "service_id"},
    "stop_times.txt": {"trip_id", "stop_id", "stop_sequence"},
}

def _read_header(zf: ZipFile, name: str) -> set[str]:
    with zf.open(name) as f:
        text = f.read().decode("utf-8", errors="replace").splitlines()
        reader = csv.DictReader(text)
        if not reader.fieldnames:
            raise ValueError(f"{name} has no header row.")
        return set(reader.fieldnames)

def validate_zip(zip_path: Path) -> None:
    if not zip_path.exists():
        raise FileNotFoundError(zip_path)

    with ZipFile(zip_path) as zf:
        names = set(zf.namelist())

        missing = REQUIRED_FILES - names
        if missing:
            raise ValueError(f"Missing required GTFS files: {sorted(missing)}")

        if ("calendar.txt" not in names) and ("calendar_dates.txt" not in names):
            raise ValueError("GTFS must include either calendar.txt or calendar_dates.txt")

        for fname, cols in REQUIRED_COLUMNS.items():
            header = _read_header(zf, fname)
            missing_cols = cols - header
            if missing_cols:
                raise ValueError(f"{fname} missing required columns: {sorted(missing_cols)}")

        _validate_dates(zf, names)
        _validate_times(zf)

def _validate_dates(zf: ZipFile, names: set[str]) -> None:
    _scan_date_cols(zf, "calendar.txt", ["start_date", "end_date"])
    
    if "calendar_dates.txt" in names:
        _scan_date_cols(zf, "calendar_dates.txt", ["date"])

def _scan_date_cols(zf: ZipFile, fname: str, cols: list[str]) -> None:
    import csv
    with zf.open(fname) as f:
        lines = f.read().decode("utf-8", errors="replace").splitlines()
        reader = csv.DictReader(lines)
        for i, row in enumerate(reader, start=2):
            for c in cols:
                v = (row.get(c) or "").strip()
                if v and not DATE_RE.match(v):
                    raise ValueError(f"{fname}:{i} invalid {c}='{v}' (expected YYYYMMDD)")

def _validate_times(zf: ZipFile) -> None:
    import csv
    fname = "stop_times.txt"
    with zf.open(fname) as f:
        lines = f.read().decode("utf-8", errors="replace").splitlines()
        reader = csv.DictReader(lines)
        for i, row in enumerate(reader, start=2):
            for c in ["arrival_time", "departure_time"]:
                v = (row.get(c) or "").strip()
                if v and not TIME_RE.match(v):
                    raise ValueError(f"{fname}:{i} invalid {c}='{v}' (expected HH:MM:SS, HH can be >24)")