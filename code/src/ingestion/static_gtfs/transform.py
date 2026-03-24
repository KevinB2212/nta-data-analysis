from __future__ import annotations

from datetime import date

def empty_to_none(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip()
    return v if v != "" else None

def yyyymmdd_to_date(v: str | None) -> date | None:
    v = empty_to_none(v)
    if not v:
        return None
    return date(int(v[0:4]), int(v[4:6]), int(v[6:8]))

def time_to_seconds(v: str | None) -> int | None:
    v = empty_to_none(v)
    if not v:
        return None
    parts = v.split(":")
    if len(parts) != 3:
        return None
    hh, mm, ss = int(parts[0]), int(parts[1]), int(parts[2])
    return hh * 3600 + mm * 60 + ss