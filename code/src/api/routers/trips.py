from fastapi import APIRouter
from sqlalchemy import text

from src.common.db import get_engine

router = APIRouter()


# get full trip info - the trip itself plus every stop it visits in order
@router.get("/{trip_id}")
def get_trip(trip_id: str):
    engine = get_engine()

    with engine.connect() as conn:
        # grab trip details along with route info
        trip = conn.execute(
            text("""
                SELECT
                    t.trip_id, t.route_id, t.service_id, t.trip_headsign,
                    t.trip_short_name, t.direction_id, t.block_id, t.shape_id,
                    r.route_short_name, r.route_long_name, r.route_type, r.route_color
                FROM gtfs_static.trips t
                JOIN gtfs_static.routes r ON t.route_id = r.route_id
                WHERE t.trip_id = :trip_id
            """),
            {"trip_id": trip_id}
        ).mappings().first()

        if not trip:
            return {"error": "Trip not found"}, 404

        # ordered list of every stop on this trip with arrival/departure times
        stop_times = conn.execute(
            text("""
                SELECT
                    st.stop_sequence, st.arrival_time, st.departure_time,
                    st.stop_headsign, st.pickup_type, st.drop_off_type,
                    s.stop_id, s.stop_name, s.stop_lat, s.stop_lon
                FROM gtfs_static.stop_times st
                JOIN gtfs_static.stops s ON st.stop_id = s.stop_id
                WHERE st.trip_id = :trip_id
                ORDER BY st.stop_sequence
            """),
            {"trip_id": trip_id}
        ).mappings().all()

    return {
        "trip": dict(trip),
        "stop_times": [dict(st) for st in stop_times]
    }


# returns the GPS coordinates that make up the route's path on a map
# shapes are stored as sequences of lat/lon points in GTFS
@router.get("/{trip_id}/shape")
def get_trip_shape(trip_id: str):
    engine = get_engine()

    with engine.connect() as conn:
        shape_id = conn.execute(
            text("SELECT shape_id FROM gtfs_static.trips WHERE trip_id = :trip_id"),
            {"trip_id": trip_id}
        ).scalar()

        if not shape_id:
            return {"error": "Trip has no shape data", "points": []}

        points = conn.execute(
            text("""
                SELECT
                    shape_pt_lat as lat, shape_pt_lon as lon,
                    shape_pt_sequence as sequence, shape_dist_traveled as distance
                FROM gtfs_static.shapes
                WHERE shape_id = :shape_id
                ORDER BY shape_pt_sequence
            """),
            {"shape_id": shape_id}
        ).mappings().all()

    return {
        "shape_id": shape_id,
        "points": [dict(p) for p in points]
    }
