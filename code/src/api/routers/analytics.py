from fastapi import APIRouter, Query
from sqlalchemy import text

from src.common.db import get_engine

router = APIRouter()


# reliability stats for a single route
# can filter by day of week and hour to see patterns (e.g. rush hour vs off-peak)
# "on-time" = within 5 min (300 sec) of scheduled time, thats the industry standard
@router.get("/route/{route_id}/reliability")
def get_route_reliability(
    route_id: str,
    day_of_week: str | None = Query(None),
    hour: int | None = Query(None, ge=0, le=23),
):
    engine = get_engine()

    with engine.connect() as conn:
        route = conn.execute(
            text("""
                SELECT route_short_name, route_long_name
                FROM gtfs_static.routes WHERE route_id = :route_id
            """),
            {"route_id": route_id}
        ).mappings().first()

        if not route:
            return {"error": "Route not found"}

        try:
            filters = ["route_id = :route_id", "delay_seconds IS NOT NULL"]
            params = {"route_id": route_id}

            if day_of_week:
                filters.append("LOWER(TO_CHAR(service_date, 'day')) LIKE :dow")
                params["dow"] = f"%{day_of_week.lower()}%"

            if hour is not None:
                filters.append("EXTRACT(HOUR FROM fetched_at) = :hour")
                params["hour"] = hour

            where_clause = " AND ".join(filters)

            result = conn.execute(
                text(f"""
                    SELECT
                        COUNT(*) as sample_size,
                        AVG(delay_seconds) as avg_delay,
                        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY delay_seconds) as median_delay,
                        COUNT(*) FILTER (WHERE ABS(delay_seconds) <= 300) * 100.0 / NULLIF(COUNT(*), 0) as on_time_pct
                    FROM analytics.trip_delay_events
                    WHERE {where_clause}
                """),
                params
            ).mappings().first()

            if result and result["sample_size"] > 0:
                return {
                    "route_id": route_id,
                    "route_name": route["route_short_name"] or route["route_long_name"],
                    "has_data": True,
                    "reliability": {
                        "on_time_percentage": round(result["on_time_pct"], 1) if result["on_time_pct"] else None,
                        "average_delay_seconds": round(result["avg_delay"], 1) if result["avg_delay"] else None,
                        "median_delay_seconds": round(result["median_delay"], 1) if result["median_delay"] else None,
                        "sample_size": result["sample_size"],
                    },
                    "filters": {"day_of_week": day_of_week, "hour": hour}
                }
        except Exception:
            pass

        return {
            "route_id": route_id,
            "route_name": route["route_short_name"] or route["route_long_name"],
            "has_data": False,
            "reliability": None,
            "message": "Reliability data not yet available. Real-time data collection pending."
        }


# same idea but for a specific stop - shows reliability per route at that stop
@router.get("/stop/{stop_id}/reliability")
def get_stop_reliability(stop_id: str):
    engine = get_engine()

    with engine.connect() as conn:
        stop = conn.execute(
            text("SELECT stop_name FROM gtfs_static.stops WHERE stop_id = :stop_id"),
            {"stop_id": stop_id}
        ).scalar()

        if not stop:
            return {"error": "Stop not found"}

        routes = conn.execute(
            text("""
                SELECT DISTINCT
                    r.route_id, r.route_short_name, r.route_long_name, r.route_type
                FROM gtfs_static.routes r
                JOIN gtfs_static.trips t ON r.route_id = t.route_id
                JOIN gtfs_static.stop_times st ON t.trip_id = st.trip_id
                WHERE st.stop_id = :stop_id
                ORDER BY r.route_short_name
            """),
            {"stop_id": stop_id}
        ).mappings().all()

        try:
            delay_stats = conn.execute(
                text("""
                    SELECT
                        route_id, COUNT(*) as sample_size,
                        AVG(delay_seconds) as avg_delay,
                        COUNT(*) FILTER (WHERE ABS(delay_seconds) <= 300) * 100.0 / NULLIF(COUNT(*), 0) as on_time_pct
                    FROM analytics.trip_delay_events
                    WHERE stop_id = :stop_id AND delay_seconds IS NOT NULL
                    GROUP BY route_id
                """),
                {"stop_id": stop_id}
            ).mappings().all()
            delay_by_route = {d["route_id"]: d for d in delay_stats}
        except Exception:
            delay_by_route = {}

    return {
        "stop_id": stop_id,
        "stop_name": stop,
        "routes": [
            {
                "route_id": r["route_id"],
                "route_name": r["route_short_name"] or r["route_long_name"],
                "route_type": r["route_type"],
                "reliability": {
                    "on_time_percentage": round(delay_by_route[r["route_id"]]["on_time_pct"], 1),
                    "average_delay_seconds": round(delay_by_route[r["route_id"]]["avg_delay"], 1),
                    "sample_size": delay_by_route[r["route_id"]]["sample_size"],
                } if r["route_id"] in delay_by_route else None,
            }
            for r in routes
        ],
    }


# dashboard homepage uses this - gives a snapshot of everything in the system
# counts of routes/stops/trips, list of operators, pipeline status, etc.
@router.get("/overview")
def get_system_overview():
    engine = get_engine()

    with engine.connect() as conn:
        routes_count = conn.execute(text("SELECT COUNT(*) FROM gtfs_static.routes")).scalar()
        stops_count = conn.execute(text("SELECT COUNT(*) FROM gtfs_static.stops")).scalar()
        trips_count = conn.execute(text("SELECT COUNT(*) FROM gtfs_static.trips")).scalar()

        agencies = conn.execute(
            text("SELECT agency_id, agency_name FROM gtfs_static.agency")
        ).mappings().all()

        route_types = conn.execute(
            text("""
                SELECT route_type, COUNT(*) as count
                FROM gtfs_static.routes
                GROUP BY route_type ORDER BY route_type
            """)
        ).mappings().all()

        last_ingestion = conn.execute(
            text("""
                SELECT run_type, status, started_at, finished_at
                FROM analytics.ingestion_runs
                ORDER BY started_at DESC LIMIT 5
            """)
        ).mappings().all()

        try:
            snapshot_count = conn.execute(
                text("SELECT COUNT(*) FROM gtfs_rt.feed_snapshots")
            ).scalar()
            delay_events_count = conn.execute(
                text("SELECT COUNT(*) FROM analytics.trip_delay_events")
            ).scalar()
            latest_event = conn.execute(
                text("SELECT MAX(fetched_at) FROM analytics.trip_delay_events")
            ).scalar()
        except Exception:
            snapshot_count = 0
            delay_events_count = 0
            latest_event = None

    route_type_names = {
        0: "Tram/Light Rail", 1: "Metro", 2: "Rail", 3: "Bus",
        4: "Ferry", 5: "Cable Car", 6: "Gondola", 7: "Funicular",
    }

    return {
        "static_data": {
            "routes": routes_count,
            "stops": stops_count,
            "trips": trips_count,
            "agencies": [dict(a) for a in agencies],
            "route_types": [
                {
                    "type_id": rt["route_type"],
                    "type_name": route_type_names.get(rt["route_type"], "Unknown"),
                    "count": rt["count"]
                }
                for rt in route_types
            ],
        },
        "realtime_data": {
            "available": snapshot_count > 0 or delay_events_count > 0,
            "feed_snapshots_count": snapshot_count,
            "delay_events_count": delay_events_count,
            "latest_event_at": latest_event.isoformat() if latest_event else None,
        },
        "recent_ingestions": [dict(i) for i in last_ingestion],
    }
