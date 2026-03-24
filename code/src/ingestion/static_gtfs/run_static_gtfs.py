from __future__ import annotations

import os
import subprocess

from src.ingestion.static_gtfs.download import download_static_zip
from src.ingestion.static_gtfs.validate import validate_zip
from src.ingestion.static_gtfs.load import load_static_gtfs

def get_git_commit() -> str | None:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], text=True).strip()
    except Exception:
        return None

def main() -> None:
    git_commit = get_git_commit()
    run_id, zip_path = download_static_zip(git_commit=git_commit)
    validate_zip(zip_path)
    load_static_gtfs(run_id, zip_path)
    print(f"Static GTFS ingestion complete. run_id={run_id} zip={zip_path}")

if __name__ == "__main__":
    main()