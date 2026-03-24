from __future__ import annotations

import csv
import json
import sqlalchemy as sa
from pathlib import Path
from zipfile import ZipFile

from sqlalchemy import text
from src.common.db import get_engine
from src.ingestion.static_gtfs.transform import empty_to_none, yyyymmdd_to_date

STAGING_SCHEMA = "gtfs_static_staging"
FINAL_SCHEMA = "gtfs_static"

CORE_TABLES = [
    "agency",
    "routes",
    "stops",
    "calendar",
    "calendar_dates",
    "trips",
    "stop_times",
    "shapes",
]

GTFS_FILES = {
    "agency": "agency.txt",
    "routes": "routes.txt",
    "stops": "stops.txt",
    "calendar": "calendar.txt",
    "calendar_dates": "calendar_dates.txt",
    "trips": "trips.txt",
    "stop_times": "stop_times.txt",
    "shapes": "shapes.txt",
}

def _create_staging(conn) -> None:
    conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {STAGING_SCHEMA};"))

    for t in CORE_TABLES:
        conn.execute(text(f"DROP TABLE IF EXISTS {STAGING_SCHEMA}.{t};"))
        conn.execute(text(f"CREATE TABLE {STAGING_SCHEMA}.{t} (LIKE {FINAL_SCHEMA}.{t} INCLUDING DEFAULTS);"))

    conn.execute(text(f"""
        ALTER TABLE {STAGING_SCHEMA}.stop_times
        ADD COLUMN IF NOT EXISTS stop_headsign TEXT,
        ADD COLUMN IF NOT EXISTS pickup_type TEXT,
        ADD COLUMN IF NOT EXISTS drop_off_type TEXT,
        ADD COLUMN IF NOT EXISTS timepoint TEXT
    """))

def _load_csv_into_table(conn, table: str, rows: list[dict]) -> int:
    if not rows:
        return 0
    cols = list(rows[0].keys())
    col_list = ", ".join(cols)
    placeholders = ", ".join([f":{c}" for c in cols])
    sql = text(f"INSERT INTO {STAGING_SCHEMA}.{table} ({col_list}) VALUES ({placeholders})")
    conn.execute(sql, rows)
    return len(rows)

def _read_gtfs_rows(zf: ZipFile, fname: str) -> list[dict]:
    with zf.open(fname) as f:
        lines = f.read().decode("utf-8", errors="replace").splitlines()
        reader = csv.DictReader(lines)
        out: list[dict] = []
        for row in reader:
            clean = {k: empty_to_none(v) for k, v in row.items()}

            if "start_date" in clean:
                clean["start_date"] = yyyymmdd_to_date(clean["start_date"])
            if "end_date" in clean:
                clean["end_date"] = yyyymmdd_to_date(clean["end_date"])
            if "date" in clean:
                clean["date"] = yyyymmdd_to_date(clean["date"])

            for int_col in ["route_type", "stop_sequence", "exception_type", "monday", "tuesday", "wednesday",
                            "thursday", "friday", "saturday", "sunday"]:
                if int_col in clean and clean[int_col] is not None:
                    clean[int_col] = int(clean[int_col])

            for float_col in ["stop_lat", "stop_lon", "shape_pt_lat", "shape_pt_lon", "shape_dist_traveled"]:
                if float_col in clean and clean[float_col] is not None:
                    clean[float_col] = float(clean[float_col])

            out.append(clean)
        return out

def _post_load_checks(conn, present_tables: list[str]) -> None:
    critical = ["routes", "stops", "trips", "stop_times"]
    for t in critical:
        if t not in present_tables:
            raise ValueError(f"Critical table {t} not present in this feed.")
        cnt = conn.execute(text(f"SELECT COUNT(*) FROM {STAGING_SCHEMA}.{t};")).scalar_one()
        if cnt == 0:
            raise ValueError(f"Post-load check failed: {t} has 0 rows in staging.")

def _merge_into_final(conn, present_tables: list[str]) -> None:
    ordered = ["agency", "routes", "stops", "calendar", "calendar_dates", "trips", "shapes", "stop_times"]

    for t in ordered:
        if t not in present_tables:
            continue
        conn.execute(text(f"TRUNCATE TABLE {FINAL_SCHEMA}.{t} CASCADE;"))
        conn.execute(text(f"INSERT INTO {FINAL_SCHEMA}.{t} SELECT * FROM {STAGING_SCHEMA}.{t};"))

def _update_run_success(conn, run_id: str, row_counts: dict) -> None:
    conn.execute(
        sa.text("""
            UPDATE analytics.ingestion_runs
            SET status = 'success',
                finished_at = now(),
                row_counts = CAST(:row_counts AS jsonb)
            WHERE run_id::text = :run_id
        """),
        {
            "run_id": run_id,
            "row_counts": json.dumps(row_counts),
        }
    )

def _update_run_failed(conn, run_id: str, error: str) -> None:
    conn.execute(
        text("""
            UPDATE analytics.ingestion_runs
            SET status='failed',
                finished_at=now(),
                error_message=:error
            WHERE run_id::text=:run_id
        """),
        {"run_id": run_id, "error": error[:4000]},
    )

def load_static_gtfs(run_id: str, zip_path: Path) -> None:
    engine = get_engine()

    with ZipFile(zip_path) as zf:
        names = set(zf.namelist())
        present_tables: list[str] = []
        row_counts: dict[str, int] = {}

        with engine.begin() as conn:
            try:
                _create_staging(conn)

                for table, fname in GTFS_FILES.items():
                    if fname not in names:
                        continue
                    rows = _read_gtfs_rows(zf, fname)
                    count = _load_csv_into_table(conn, table, rows)
                    present_tables.append(table)
                    row_counts[table] = count

                _post_load_checks(conn, present_tables)
                _merge_into_final(conn, present_tables)

                _update_run_success(conn, run_id, row_counts)

                for t in present_tables:
                    conn.execute(text(f"DROP TABLE IF EXISTS {STAGING_SCHEMA}.{t};"))

            except Exception as e:
                with engine.begin() as conn2:
                    _update_run_failed(conn2, run_id, str(e))
                raise