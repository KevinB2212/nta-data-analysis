import os
import pytest
from sqlalchemy import text

from src.common.db import get_engine
from src.ingestion.static_gtfs.run_static_gtfs import main as run_static_main
from dotenv import load_dotenv
from sqlalchemy import text

load_dotenv()

@pytest.mark.integration
def test_static_pipeline_end_to_end():
    # Ensure required env var exists
    assert os.getenv("NTA_GTFS_STATIC_URL"), "NTA_GTFS_STATIC_URL must be set in .env for integration test"

    # Run pipeline
    run_static_main()

    engine = get_engine()
    with engine.connect() as conn:
        status = conn.execute(
            text("""
                SELECT status
                FROM analytics.ingestion_runs
                WHERE run_type='static'
                ORDER BY started_at DESC
                LIMIT 1
            """)
        ).scalar_one()
        assert status == "success"

        routes_cnt = conn.execute(text("SELECT COUNT(*) FROM gtfs_static.routes")).scalar_one()
        stops_cnt = conn.execute(text("SELECT COUNT(*) FROM gtfs_static.stops")).scalar_one()
        trips_cnt = conn.execute(text("SELECT COUNT(*) FROM gtfs_static.trips")).scalar_one()
        st_cnt = conn.execute(text("SELECT COUNT(*) FROM gtfs_static.stop_times")).scalar_one()

        assert routes_cnt > 0
        assert stops_cnt > 0
        assert trips_cnt > 0
        assert st_cnt > 0

        row_counts = conn.execute(
            text("""
                SELECT row_counts
                FROM analytics.ingestion_runs
                WHERE run_type='static'
                ORDER BY started_at DESC
                LIMIT 1
            """)
        ).scalar_one()
        assert row_counts is not None
        assert "routes" in row_counts
        assert row_counts["routes"] == routes_cnt or row_counts["routes"] >= routes_cnt