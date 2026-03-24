from __future__ import annotations

import os
from pathlib import Path
from datetime import datetime, timezone
import requests

from sqlalchemy import text
from src.common.db import get_engine

RAW_DIR = Path("data/raw")

def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

def create_run(run_type: str, source_url: str, artifact_path: str, git_commit: str | None) -> str:
    engine = get_engine()
    with engine.begin() as conn:
        run_id = conn.execute(
            text("""
                INSERT INTO analytics.ingestion_runs (run_type, status, source_url, artifact_path, git_commit)
                VALUES (:run_type, 'started', :source_url, :artifact_path, :git_commit)
                RETURNING run_id::text
            """),
            {"run_type": run_type, "source_url": source_url, "artifact_path": artifact_path, "git_commit": git_commit},
        ).scalar_one()
    return run_id

def download_static_zip(git_commit: str | None = None) -> tuple[str, Path]:
    url = os.getenv("NTA_GTFS_STATIC_URL")
    if not url:
        raise RuntimeError("NTA_GTFS_STATIC_URL is not set. Add it to .env (not .env.example).")

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    out_path = RAW_DIR / f"gtfs_static_{utc_stamp()}.zip"

    run_id = create_run("static", url, str(out_path), git_commit)

    resp = requests.get(url, timeout=60)
    resp.raise_for_status()

    out_path.write_bytes(resp.content)
    return run_id, out_path