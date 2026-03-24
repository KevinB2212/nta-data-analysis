from fastapi import APIRouter, Query
from sqlalchemy import text

from src.common.db import get_engine

router = APIRouter()


# flexible stop search - can search by name, by location (lat/lon), or just list all
@router.get("")
def list_stops(
    search: str | None = Query(None),
    lat: float | None = Query(None),
    lon: float | None = Query(None),
    radius_km: float = Query(0.5),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
):
    engine = get_engine()
    params = {"limit": limit, "offset": offset}

    if lat is not None and lon is not None:
        # nearby search using haversine formula in SQL
        # 6371 is earth's radius in km - calculates distance between two coords
        query = """
            SELECT
                stop_id,
                stop_code,
                stop_name,
                stop_lat,
                stop_lon,
                (
                    6371 * acos(
                        cos(radians(:lat)) * cos(radians(stop_lat)) *
                        cos(radians(stop_lon) - radians(:lon)) +
                        sin(radians(:lat)) * sin(radians(stop_lat))
                    )
                ) AS distance_km
            FROM gtfs_static.stops
            WHERE stop_lat IS NOT NULL AND stop_lon IS NOT NULL
            HAVING distance_km <= :radius_km
            ORDER BY distance_km
            LIMIT :limit OFFSET :offset
        """
        params.update({"lat": lat, "lon": lon, "radius_km": radius_km})
    elif search:
        # text search - ILIKE is case-insensitive match in postgres
        query = """
            SELECT stop_id, stop_code, stop_name, stop_lat, stop_lon
            FROM gtfs_static.stops
            WHERE stop_name ILIKE :search
            ORDER BY stop_name
            LIMIT :limit OFFSET :offset
        """
        params["search"] = f"%{search}%"
    else:
        # no filters, just return all stops paginated
        query = """
            SELECT stop_id, stop_code, stop_name, stop_lat, stop_lon
            FROM gtfs_static.stops
            ORDER BY stop_name
            LIMIT :limit OFFSET :offset
        """

    with engine.connect() as conn:
        rows = conn.execute(text(query), params).mappings().all()

    return {"stops": [dict(row) for row in rows]}


# single stop details + all routes that pass through it
@router.get("/{stop_id}")
def get_stop(stop_id: str):
    engine = get_engine()

    with engine.connect() as conn:
        stop = conn.execute(
            text("""
                SELECT
                    stop_id, stop_code, stop_name, stop_desc,
                    stop_lat, stop_lon, zone_id, location_type,
                    parent_station, wheelchair_boarding
                FROM gtfs_static.stops
                WHERE stop_id = :stop_id
            """),
            {"stop_id": stop_id}
        ).mappings().first()

        if not stop:
            return {"error": "Stop not found"}, 404

        # find all routes serving this stop by joining through trips and stop_times
        routes = conn.execute(
            text("""
                SELECT DISTINCT
                    r.route_id, r.route_short_name, r.route_long_name,
                    r.route_type, r.route_color
                FROM gtfs_static.routes r
                JOIN gtfs_static.trips t ON r.route_id = t.route_id
                JOIN gtfs_static.stop_times st ON t.trip_id = st.trip_id
                WHERE st.stop_id = :stop_id
                ORDER BY r.route_short_name
            """),
            {"stop_id": stop_id}
        ).mappings().all()

    return {
        "stop": dict(stop),
        "routes": [dict(r) for r in routes]
    }


# get scheduled departures from a stop (used for timetable info)
@router.get("/{stop_id}/departures")
def get_stop_departures(
    stop_id: str,
    route_id: str | None = Query(None),
    limit: int = Query(20, le=100),
):
    engine = get_engine()

    query = """
        SELECT
            st.trip_id, st.arrival_time, st.departure_time, st.stop_sequence,
            t.trip_headsign, t.direction_id,
            r.route_id, r.route_short_name, r.route_long_name, r.route_type
        FROM gtfs_static.stop_times st
        JOIN gtfs_static.trips t ON st.trip_id = t.trip_id
        JOIN gtfs_static.routes r ON t.route_id = r.route_id
        WHERE st.stop_id = :stop_id
    """
    params = {"stop_id": stop_id, "limit": limit}

    if route_id:
        query += " AND r.route_id = :route_id"
        params["route_id"] = route_id

    query += " ORDER BY st.departure_time LIMIT :limit"

    with engine.connect() as conn:
        rows = conn.execute(text(query), params).mappings().all()

    return {"departures": [dict(row) for row in rows]}
