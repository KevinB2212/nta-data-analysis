from fastapi import APIRouter, Query
from sqlalchemy import text

from src.common.db import get_engine

router = APIRouter()


# lists all routes, with optional filters for type (bus/rail/tram) or agency
# supports pagination with limit/offset for the frontend
@router.get("")
def list_routes(
    route_type: int | None = Query(None),
    agency_id: str | None = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
):
    engine = get_engine()

    # join with agency table to get the operator name alongside route info
    query = """
        SELECT
            r.route_id,
            r.agency_id,
            r.route_short_name,
            r.route_long_name,
            r.route_type,
            r.route_color,
            a.agency_name
        FROM gtfs_static.routes r
        LEFT JOIN gtfs_static.agency a ON r.agency_id = a.agency_id
        WHERE 1=1
    """
    params = {"limit": limit, "offset": offset}

    # dynamically add filters if they were passed in
    if route_type is not None:
        query += " AND r.route_type = :route_type"
        params["route_type"] = route_type

    if agency_id:
        query += " AND r.agency_id = :agency_id"
        params["agency_id"] = agency_id

    query += " ORDER BY r.route_short_name LIMIT :limit OFFSET :offset"

    with engine.connect() as conn:
        rows = conn.execute(text(query), params).mappings().all()

        # separate count query so frontend knows the total for pagination
        count_query = """
            SELECT COUNT(*) FROM gtfs_static.routes r
            WHERE 1=1
        """
        if route_type is not None:
            count_query += " AND r.route_type = :route_type"
        if agency_id:
            count_query += " AND r.agency_id = :agency_id"

        total = conn.execute(text(count_query), params).scalar()

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "routes": [dict(row) for row in rows]
    }


# get a single route + all the stops it serves
@router.get("/{route_id}")
def get_route(route_id: str):
    engine = get_engine()

    with engine.connect() as conn:
        route = conn.execute(
            text("""
                SELECT
                    r.route_id,
                    r.agency_id,
                    r.route_short_name,
                    r.route_long_name,
                    r.route_desc,
                    r.route_type,
                    r.route_color,
                    r.route_text_color,
                    a.agency_name
                FROM gtfs_static.routes r
                LEFT JOIN gtfs_static.agency a ON r.agency_id = a.agency_id
                WHERE r.route_id = :route_id
            """),
            {"route_id": route_id}
        ).mappings().first()

        if not route:
            return {"error": "Route not found"}, 404

        # find all unique stops for this route by going through trips -> stop_times -> stops
        stops = conn.execute(
            text("""
                SELECT DISTINCT
                    s.stop_id,
                    s.stop_name,
                    s.stop_lat,
                    s.stop_lon
                FROM gtfs_static.stops s
                JOIN gtfs_static.stop_times st ON s.stop_id = st.stop_id
                JOIN gtfs_static.trips t ON st.trip_id = t.trip_id
                WHERE t.route_id = :route_id
                ORDER BY s.stop_name
            """),
            {"route_id": route_id}
        ).mappings().all()

    return {
        "route": dict(route),
        "stops": [dict(s) for s in stops]
    }


# get all trips for a specific route (optionally filter by direction)
@router.get("/{route_id}/trips")
def get_route_trips(
    route_id: str,
    direction_id: int | None = Query(None),
    limit: int = Query(50, le=200),
):
    engine = get_engine()

    query = """
        SELECT
            t.trip_id,
            t.service_id,
            t.trip_headsign,
            t.direction_id,
            t.shape_id
        FROM gtfs_static.trips t
        WHERE t.route_id = :route_id
    """
    params = {"route_id": route_id, "limit": limit}

    if direction_id is not None:
        query += " AND t.direction_id = :direction_id"
        params["direction_id"] = direction_id

    query += " LIMIT :limit"

    with engine.connect() as conn:
        rows = conn.execute(text(query), params).mappings().all()

    return {"trips": [dict(row) for row in rows]}
