from __future__ import annotations
import os
import sys
import time
import subprocess
from datetime import datetime, timedelta
from pathlib import Path

POLL_MODULE = "src.ingestion.rt_gtfs.poll_tripupdates"
BUILD_ANALYTICS_MODULE = "src.analytics.build_trip_delay_events"
TRAIN_MODULE = "src.ml.train_delay_model"

ANALYTICS_EVERY_SECONDS = 5 * 60
TRAIN_EVERY_SECONDS = 3 * 60 * 60

LOG_DIR = Path("logs")
LOG_DIR.mkdir(parents=True, exist_ok=True)

def ts() -> str:
    return datetime.utcnow().strftime("%Y%m%d_%H%M%S")

def run_module(module: str, log_prefix: str, env: dict[str, str] | None = None) -> int:
    out = LOG_DIR / f"{log_prefix}.{ts()}.out.log"
    err = LOG_DIR / f"{log_prefix}.{ts()}.err.log"
    with out.open("wb") as fout, err.open("wb") as ferr:
        p = subprocess.run(
            [sys.executable, "-m", module],
            stdout=fout,
            stderr=ferr,
            env=env or os.environ.copy(),
        )
        return p.returncode

def main() -> None:

    poll_out = LOG_DIR / "poller.out.log"
    poll_err = LOG_DIR / "poller.err.log"

    poll_out_f = poll_out.open("ab")
    poll_err_f = poll_err.open("ab")

    print("Starting poller...")
    poller = subprocess.Popen(
        [sys.executable, "-m", POLL_MODULE],
        stdout=poll_out_f,
        stderr=poll_err_f,
        env=os.environ.copy(),
    )

    next_analytics = time.time() + 10
    next_train = time.time() + 30

    analytics_running = False
    train_running = False

    try:
        while True:
            if poller.poll() is not None:
                raise SystemExit(f"Poller exited with code {poller.returncode}. Check logs/poller.*.log")

            now = time.time()

            if now >= next_analytics and not analytics_running:
                analytics_running = True
                print(f"[{datetime.utcnow().isoformat()}] Build analytics start")
                rc = run_module(BUILD_ANALYTICS_MODULE, "analytics")
                print(f"[{datetime.utcnow().isoformat()}] Build analytics end rc={rc}")
                analytics_running = False
                next_analytics = now + ANALYTICS_EVERY_SECONDS

            if now >= next_train and not train_running:
                train_running = True
                print(f"[{datetime.utcnow().isoformat()}] Train model start")
                rc = run_module(TRAIN_MODULE, "train")
                print(f"[{datetime.utcnow().isoformat()}] Train model end rc={rc}")
                train_running = False
                next_train = now + TRAIN_EVERY_SECONDS

            time.sleep(5)

    finally:
        print("Stopping poller...")
        poller.terminate()
        try:
            poller.wait(timeout=10)
        except subprocess.TimeoutExpired:
            poller.kill()
        poll_out_f.close()
        poll_err_f.close()

if __name__ == "__main__":
    main()
