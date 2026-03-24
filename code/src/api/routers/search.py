import math

from fastapi import APIRouter, Query, HTTPException
from sqlalchemy import text

from src.common.db import get_engine


# haversine formula - gives us the straight-line distance in km between two
# lat/lon points on earth. 6371 = earth's radius in km.
# we use this to estimate travel times and walking distances
def _haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

router = APIRouter()


# pulls reliability stats for a batch of routes from our delay events table
# on-time means within 5 minutes (300 seconds) of scheduled time
def _get_route_reliability(conn, route_ids: list[str]) -> dict:
    if not route_ids:
        return {}
    result = conn.execute(
        text("""
            SELECT
                route_id, COUNT(*) as sample_size,
                AVG(delay_seconds) as avg_delay,
                COUNT(*) FILTER (WHERE ABS(delay_seconds) <= 300) * 100.0
                    / NULLIF(COUNT(*), 0) as on_time_pct
            FROM analytics.trip_delay_events
            WHERE route_id = ANY(:route_ids) AND delay_seconds IS NOT NULL
            GROUP BY route_id
        """),
        {"route_ids": route_ids},
    ).mappings().all()
    return {
        r["route_id"]: {
            "on_time_percentage": float(round(r["on_time_pct"], 1)) if r["on_time_pct"] else None,
            "average_delay_seconds": float(round(r["avg_delay"], 1)) if r["avg_delay"] else None,
            "sample_size": int(r["sample_size"]),
        }
        for r in result
    }


# for multi-leg journeys we multiply the on-time % of each leg together
# e.g. if leg1 is 90% on-time and leg2 is 80%, combined is 72%
def _journey_reliability(journey: dict, rel_map: dict) -> dict | None:
    route_ids = [leg["route"]["route_id"] for leg in journey["legs"]]
    leg_reliabilities = [rel_map.get(rid) for rid in route_ids]
    valid = [r for r in leg_reliabilities if r and r["on_time_percentage"] is not None]
    if not valid:
        return None
    combined_pct = 100.0
    total_delay = 0.0
    total_samples = 0
    for r in valid:
        combined_pct *= r["on_time_percentage"] / 100.0
        total_delay += r["average_delay_seconds"] or 0
        total_samples += r["sample_size"]
    return {
        "on_time_percentage": round(combined_pct, 1) if len(valid) > 1 else valid[0]["on_time_percentage"],
        "average_delay_seconds": round(total_delay, 1),
        "sample_size": total_samples,
    }


# finds stops within a radius of a given point
# uses a bounding box first (lat +/- 0.05, lon +/- 0.1) to narrow down
# before doing the expensive haversine calc - way faster this way
def _find_nearby_stops(conn, lat: float, lon: float, radius_km: float = 0.5, limit: int = 10):
    result = conn.execute(
        text("""
            SELECT
                stop_id, stop_name, stop_lat, stop_lon,
                (
                    6371 * acos(
                        LEAST(1.0, GREATEST(-1.0,
                            cos(radians(:lat)) * cos(radians(stop_lat)) *
                            cos(radians(stop_lon) - radians(:lon)) +
                            sin(radians(:lat)) * sin(radians(stop_lat))
                        ))
                    )
                ) AS distance_km
            FROM gtfs_static.stops
            WHERE stop_lat IS NOT NULL AND stop_lon IS NOT NULL
              AND stop_lat BETWEEN :lat - 0.05 AND :lat + 0.05
              AND stop_lon BETWEEN :lon - 0.1 AND :lon + 0.1
            ORDER BY distance_km
            LIMIT :limit
        """),
        {"lat": lat, "lon": lon, "limit": limit * 2}
    ).mappings().all()

    return [dict(r) for r in result if r["distance_km"] <= radius_km][:limit]


# all routes that go through a particular stop
def _find_routes_from_stop(conn, stop_id: str):
    result = conn.execute(
        text("""
            SELECT DISTINCT
                r.route_id, r.route_short_name, r.route_long_name,
                r.route_type, r.route_color, a.agency_name
            FROM gtfs_static.routes r
            JOIN gtfs_static.trips t ON r.route_id = t.route_id
            JOIN gtfs_static.stop_times st ON t.trip_id = st.trip_id
            LEFT JOIN gtfs_static.agency a ON r.agency_id = a.agency_id
            WHERE st.stop_id = :stop_id
        """),
        {"stop_id": stop_id}
    ).mappings().all()
    return [dict(r) for r in result]


# checks if theres a single route that goes from origin stop to dest stop
# the key trick: we check stop_sequence so origin comes BEFORE destination
# on the same trip (otherwise the bus would be going the wrong direction)
def _check_direct_route(conn, origin_stop_id: str, dest_stop_id: str):
    result = conn.execute(
        text("""
            SELECT DISTINCT ON (r.route_id)
                r.route_id, r.route_short_name, r.route_long_name,
                r.route_type, r.route_color, a.agency_name,
                t.trip_headsign,
                st1.departure_time as origin_departure,
                st2.arrival_time as dest_arrival,
                (st2.stop_sequence - st1.stop_sequence) as num_stops,
                EXTRACT(EPOCH FROM (
                    st2.arrival_time::interval - st1.departure_time::interval
                )) / 60.0 as travel_minutes
            FROM gtfs_static.stop_times st1
            JOIN gtfs_static.stop_times st2 ON st1.trip_id = st2.trip_id
            JOIN gtfs_static.trips t ON st1.trip_id = t.trip_id
            JOIN gtfs_static.routes r ON t.route_id = r.route_id
            LEFT JOIN gtfs_static.agency a ON r.agency_id = a.agency_id
            WHERE st1.stop_id = :origin_stop_id
              AND st2.stop_id = :dest_stop_id
              AND st1.stop_sequence < st2.stop_sequence
            ORDER BY r.route_id,
                     EXTRACT(EPOCH FROM (st2.arrival_time::interval - st1.departure_time::interval))
            LIMIT 20
        """),
        {"origin_stop_id": origin_stop_id, "dest_stop_id": dest_stop_id}
    ).mappings().all()
    return [dict(r) for r in result]


# direct route search - finds routes between two points without transfers
# approach: find nearby stops at each end, then check every combo for direct routes
@router.get("/routes")
def search_routes(
    origin_lat: float = Query(...),
    origin_lon: float = Query(...),
    dest_lat: float = Query(...),
    dest_lon: float = Query(...),
    radius_km: float = Query(0.5),
):
    engine = get_engine()

    with engine.connect() as conn:
        # step 1: find stops near origin and destination
        origin_stops = _find_nearby_stops(conn, origin_lat, origin_lon, radius_km)
        dest_stops = _find_nearby_stops(conn, dest_lat, dest_lon, radius_km)

        if not origin_stops:
            raise HTTPException(status_code=404, detail=f"No stops found within {radius_km}km of origin")
        if not dest_stops:
            raise HTTPException(status_code=404, detail=f"No stops found within {radius_km}km of destination")

        # step 2: try every origin stop x dest stop pair looking for direct routes
        # keep only the best option per route (lowest score wins)
        best_per_route = {}

        for o_stop in origin_stops:
            for d_stop in dest_stops:
                direct_routes = _check_direct_route(conn, o_stop["stop_id"], d_stop["stop_id"])

                for route in direct_routes:
                    rid = route["route_id"]
                    walk = o_stop["distance_km"] + d_stop["distance_km"]
                    travel = float(route["travel_minutes"]) if route.get("travel_minutes") else 999
                    # score = travel time + walking penalty (walking 1km ~ 15min)
                    score = travel + walk * 15

                    # skip if we already found a better option for this route
                    if rid in best_per_route and best_per_route[rid]["_score"] <= score:
                        continue

                    best_per_route[rid] = {
                        "_score": score,
                        "route": {
                            "route_id": route["route_id"],
                            "route_short_name": route["route_short_name"],
                            "route_long_name": route["route_long_name"],
                            "route_type": route["route_type"],
                            "route_color": route["route_color"],
                            "agency_name": route["agency_name"],
                            "trip_headsign": route["trip_headsign"],
                        },
                        "origin_stop": {
                            "stop_id": o_stop["stop_id"],
                            "stop_name": o_stop["stop_name"],
                            "walk_distance_km": round(o_stop["distance_km"], 3),
                        },
                        "destination_stop": {
                            "stop_id": d_stop["stop_id"],
                            "stop_name": d_stop["stop_name"],
                            "walk_distance_km": round(d_stop["distance_km"], 3),
                        },
                        "num_stops": route["num_stops"],
                        "sample_departure": route["origin_departure"],
                        "sample_arrival": route["dest_arrival"],
                        "reliability": None,
                    }

        route_options = []
        for opt in best_per_route.values():
            opt.pop("_score", None)
            route_options.append(opt)

        all_route_ids = list({r["route"]["route_id"] for r in route_options})
        try:
            rel_map = _get_route_reliability(conn, all_route_ids)
        except Exception:
            rel_map = {}

        for opt in route_options:
            opt["reliability"] = rel_map.get(opt["route"]["route_id"])

        # sort results: routes with reliability data first, then by on-time %,
        # then by walking distance as a tiebreaker
        def sort_key(x):
            rel = x.get("reliability")
            has_data = 0 if rel and rel["on_time_percentage"] is not None else 1
            on_time = -(rel["on_time_percentage"] if rel and rel["on_time_percentage"] is not None else 0)
            walk = x["origin_stop"]["walk_distance_km"] + x["destination_stop"]["walk_distance_km"]
            return (has_data, on_time, walk)

        route_options.sort(key=sort_key)

    return {
        "origin": {"lat": origin_lat, "lon": origin_lon},
        "destination": {"lat": dest_lat, "lon": dest_lon},
        "origin_stops_searched": len(origin_stops),
        "dest_stops_searched": len(dest_stops),
        "route_options": route_options[:20],
    }


@router.get("/stops-nearby")
def search_stops_nearby(
    lat: float = Query(...),
    lon: float = Query(...),
    radius_km: float = Query(0.5),
    limit: int = Query(10, le=50),
):
    engine = get_engine()
    with engine.connect() as conn:
        stops = _find_nearby_stops(conn, lat, lon, radius_km, limit)
    return {"location": {"lat": lat, "lon": lon}, "radius_km": radius_km, "stops": stops}


# this is the tricky one - finds journeys that need a transfer between two routes
# the idea: find a "hub" stop where route A (from origin) meets route B (to dest)
# uses CTEs (common table expressions) in SQL to match up the two legs
def _find_transfer_journeys(conn, origin_stops: list, dest_stops: list,
                            origin_lat: float, origin_lon: float,
                            dest_lat: float, dest_lon: float,
                            max_results: int = 15):
    origin_stop_ids = [s["stop_id"] for s in origin_stops]
    dest_stop_ids = [s["stop_id"] for s in dest_stops]
    origin_stop_map = {s["stop_id"]: s for s in origin_stops}
    dest_stop_map = {s["stop_id"]: s for s in dest_stops}

    # limit hub search to an area between origin and destination (with some padding)
    # this avoids checking transfer points that are way out of the way
    mid_lat = (origin_lat + dest_lat) / 2
    mid_lon = (origin_lon + dest_lon) / 2
    lat_span = abs(origin_lat - dest_lat)
    lon_span = abs(origin_lon - dest_lon)
    hub_lat_pad = max(lat_span, 0.02) + 0.02
    hub_lon_pad = max(lon_span, 0.03) + 0.03

    result_rows = conn.execute(
        text("""
            WITH origin_route_hubs AS (
                SELECT DISTINCT
                    r.route_id as leg1_route_id,
                    r.route_short_name as leg1_route_name,
                    r.route_long_name as leg1_route_long,
                    r.route_type as leg1_route_type,
                    r.route_color as leg1_route_color,
                    a.agency_name as leg1_agency,
                    st_origin.stop_id as origin_stop_id,
                    st_hub.stop_id as leg1_hub_stop_id,
                    s_hub.stop_name as leg1_hub_stop_name,
                    s_hub.stop_lat as leg1_hub_lat,
                    s_hub.stop_lon as leg1_hub_lon
                FROM gtfs_static.routes r
                JOIN gtfs_static.trips t ON r.route_id = t.route_id
                JOIN gtfs_static.stop_times st_origin ON t.trip_id = st_origin.trip_id
                JOIN gtfs_static.stop_times st_hub ON t.trip_id = st_hub.trip_id
                JOIN gtfs_static.stops s_hub ON st_hub.stop_id = s_hub.stop_id
                LEFT JOIN gtfs_static.agency a ON r.agency_id = a.agency_id
                WHERE st_origin.stop_id = ANY(:origin_stop_ids)
                  AND st_origin.stop_sequence < st_hub.stop_sequence
                  AND s_hub.stop_lat BETWEEN :hub_lat_min AND :hub_lat_max
                  AND s_hub.stop_lon BETWEEN :hub_lon_min AND :hub_lon_max
            ),
            dest_route_hubs AS (
                SELECT DISTINCT
                    r.route_id as leg2_route_id,
                    r.route_short_name as leg2_route_name,
                    r.route_long_name as leg2_route_long,
                    r.route_type as leg2_route_type,
                    r.route_color as leg2_route_color,
                    a.agency_name as leg2_agency,
                    st_dest.stop_id as dest_stop_id,
                    st_hub.stop_id as leg2_hub_stop_id,
                    s_hub.stop_name as leg2_hub_stop_name,
                    s_hub.stop_lat as leg2_hub_lat,
                    s_hub.stop_lon as leg2_hub_lon
                FROM gtfs_static.routes r
                JOIN gtfs_static.trips t ON r.route_id = t.route_id
                JOIN gtfs_static.stop_times st_dest ON t.trip_id = st_dest.trip_id
                JOIN gtfs_static.stop_times st_hub ON t.trip_id = st_hub.trip_id
                JOIN gtfs_static.stops s_hub ON st_hub.stop_id = s_hub.stop_id
                LEFT JOIN gtfs_static.agency a ON r.agency_id = a.agency_id
                WHERE st_dest.stop_id = ANY(:dest_stop_ids)
                  AND st_hub.stop_sequence < st_dest.stop_sequence
                  AND s_hub.stop_lat BETWEEN :hub_lat_min AND :hub_lat_max
                  AND s_hub.stop_lon BETWEEN :hub_lon_min AND :hub_lon_max
            )
            SELECT DISTINCT
                o.leg1_route_id, o.leg1_route_name, o.leg1_route_long,
                o.leg1_route_type, o.leg1_route_color, o.leg1_agency,
                o.origin_stop_id,
                o.leg1_hub_stop_id as transfer_stop_id,
                o.leg1_hub_stop_name as transfer_stop_name,
                o.leg1_hub_lat as transfer_lat,
                o.leg1_hub_lon as transfer_lon,
                d.leg2_route_id, d.leg2_route_name, d.leg2_route_long,
                d.leg2_route_type, d.leg2_route_color, d.leg2_agency,
                d.dest_stop_id,
                d.leg2_hub_stop_id as leg2_board_stop_id,
                d.leg2_hub_stop_name as leg2_board_stop_name
            FROM origin_route_hubs o
            JOIN dest_route_hubs d ON (
                o.leg1_hub_stop_id = d.leg2_hub_stop_id
                OR (
                    o.leg1_hub_lat BETWEEN d.leg2_hub_lat - 0.002 AND d.leg2_hub_lat + 0.002
                    AND o.leg1_hub_lon BETWEEN d.leg2_hub_lon - 0.003 AND d.leg2_hub_lon + 0.003
                )
            )
            WHERE o.leg1_route_id != d.leg2_route_id
            LIMIT :max_results
        """),
        {
            "origin_stop_ids": origin_stop_ids,
            "dest_stop_ids": dest_stop_ids,
            "max_results": max_results * 3,
            "hub_lat_min": mid_lat - hub_lat_pad,
            "hub_lat_max": mid_lat + hub_lat_pad,
            "hub_lon_min": mid_lon - hub_lon_pad,
            "hub_lon_max": mid_lon + hub_lon_pad,
        }
    ).mappings().all()

    result = [dict(row) for row in result_rows]

    # prefer transfers involving luas/rail (type 0/2) and mixed-mode trips
    # e.g. bus -> luas is more interesting than bus -> bus
    def sort_key(row):
        has_luas_rail = row["leg1_route_type"] in (0, 2) or row["leg2_route_type"] in (0, 2)
        mixed_mode = row["leg1_route_type"] != row["leg2_route_type"]
        return (0 if has_luas_rail else 1, 0 if mixed_mode else 1)

    result.sort(key=sort_key)

    journeys = []
    seen = set()

    for row in result:
        key = (row["leg1_route_id"], row["leg2_route_id"], row["transfer_stop_id"])
        if key in seen:
            continue
        seen.add(key)

        origin_stop = origin_stop_map.get(row["origin_stop_id"], {})
        dest_stop = dest_stop_map.get(row["dest_stop_id"], {})

        o_lat = origin_stop.get("stop_lat", origin_lat)
        o_lon = origin_stop.get("stop_lon", origin_lon)
        d_lat = dest_stop.get("stop_lat", dest_lat)
        d_lon = dest_stop.get("stop_lon", dest_lon)
        # rough duration estimate: distance / 20 km/h avg speed + 10 min buffer for the transfer
        leg1_km = _haversine_km(o_lat, o_lon, row["transfer_lat"], row["transfer_lon"])
        leg2_km = _haversine_km(row["transfer_lat"], row["transfer_lon"], d_lat, d_lon)
        transfer_duration = round((leg1_km + leg2_km) / 20 * 60 + 10, 1)

        journey = {
            "type": "transfer",
            "estimated_duration_mins": transfer_duration,
            "legs": [
                {
                    "leg_number": 1,
                    "route": {
                        "route_id": row["leg1_route_id"],
                        "route_short_name": row["leg1_route_name"],
                        "route_long_name": row["leg1_route_long"],
                        "route_type": row["leg1_route_type"],
                        "route_color": row["leg1_route_color"],
                        "agency_name": row["leg1_agency"],
                    },
                    "from_stop": {
                        "stop_id": row["origin_stop_id"],
                        "stop_name": origin_stop.get("stop_name", ""),
                        "walk_distance_km": round(origin_stop.get("distance_km", 0), 3),
                    },
                    "to_stop": {
                        "stop_id": row["transfer_stop_id"],
                        "stop_name": row["transfer_stop_name"],
                    },
                },
                {
                    "leg_number": 2,
                    "route": {
                        "route_id": row["leg2_route_id"],
                        "route_short_name": row["leg2_route_name"],
                        "route_long_name": row["leg2_route_long"],
                        "route_type": row["leg2_route_type"],
                        "route_color": row["leg2_route_color"],
                        "agency_name": row["leg2_agency"],
                    },
                    "from_stop": {
                        "stop_id": row.get("leg2_board_stop_id", row["transfer_stop_id"]),
                        "stop_name": row.get("leg2_board_stop_name", row["transfer_stop_name"]),
                    },
                    "to_stop": {
                        "stop_id": row["dest_stop_id"],
                        "stop_name": dest_stop.get("stop_name", ""),
                        "walk_distance_km": round(dest_stop.get("distance_km", 0), 3),
                    },
                },
            ],
            "transfer_stop": {
                "stop_id": row["transfer_stop_id"],
                "stop_name": row["transfer_stop_name"],
                "stop_lat": row["transfer_lat"],
                "stop_lon": row["transfer_lon"],
            },
            "reliability": None,
        }
        journeys.append(journey)

        if len(journeys) >= max_results:
            break

    return journeys


# main journey search endpoint - the frontend calls this when you hit "Find Routes"
# finds both direct routes and transfer options, ranks them by reliability
@router.get("/journeys")
def search_journeys(
    origin_lat: float = Query(...),
    origin_lon: float = Query(...),
    dest_lat: float = Query(...),
    dest_lon: float = Query(...),
    radius_km: float = Query(0.5),
    include_transfers: bool = Query(True),
):
    engine = get_engine()

    with engine.connect() as conn:
        origin_stops = _find_nearby_stops(conn, origin_lat, origin_lon, radius_km, limit=15)
        dest_stops = _find_nearby_stops(conn, dest_lat, dest_lon, radius_km, limit=15)

        if not origin_stops:
            raise HTTPException(status_code=404, detail=f"No stops found within {radius_km}km of origin")
        if not dest_stops:
            raise HTTPException(status_code=404, detail=f"No stops found within {radius_km}km of destination")

        all_journeys = []
        best_per_route = {}

        for o_stop in origin_stops:
            for d_stop in dest_stops:
                direct_routes = _check_direct_route(conn, o_stop["stop_id"], d_stop["stop_id"])

                for route in direct_routes:
                    rid = route["route_id"]
                    travel_mins = round(float(route["travel_minutes"]), 1) if route.get("travel_minutes") else None
                    walk = o_stop["distance_km"] + d_stop["distance_km"]
                    score = (travel_mins or 999) + walk * 15

                    if rid in best_per_route and best_per_route[rid]["_score"] <= score:
                        continue

                    journey = {
                        "type": "direct",
                        "estimated_duration_mins": travel_mins,
                        "_score": score,
                        "legs": [
                            {
                                "leg_number": 1,
                                "route": {
                                    "route_id": route["route_id"],
                                    "route_short_name": route["route_short_name"],
                                    "route_long_name": route["route_long_name"],
                                    "route_type": route["route_type"],
                                    "route_color": route["route_color"],
                                    "agency_name": route["agency_name"],
                                    "trip_headsign": route["trip_headsign"],
                                },
                                "from_stop": {
                                    "stop_id": o_stop["stop_id"],
                                    "stop_name": o_stop["stop_name"],
                                    "walk_distance_km": round(o_stop["distance_km"], 3),
                                },
                                "to_stop": {
                                    "stop_id": d_stop["stop_id"],
                                    "stop_name": d_stop["stop_name"],
                                    "walk_distance_km": round(d_stop["distance_km"], 3),
                                },
                                "num_stops": route["num_stops"],
                            }
                        ],
                        "transfer_stop": None,
                        "reliability": None,
                    }
                    best_per_route[rid] = journey

        for j in best_per_route.values():
            j.pop("_score", None)
            all_journeys.append(j)

        if include_transfers:
            transfer_journeys = _find_transfer_journeys(
                conn, origin_stops, dest_stops,
                origin_lat, origin_lon, dest_lat, dest_lon
            )
            all_journeys.extend(transfer_journeys)

        all_route_ids = list({
            leg["route"]["route_id"]
            for j in all_journeys
            for leg in j["legs"]
        })
        try:
            rel_map = _get_route_reliability(conn, all_route_ids)
        except Exception:
            rel_map = {}

        for j in all_journeys:
            j["reliability"] = _journey_reliability(j, rel_map)

        # final sort: direct first, then by reliability, then duration
        # this is the key part - we're ranking by reliability not just speed
        def sort_key(j):
            rel = j.get("reliability")
            is_direct = 0 if j["type"] == "direct" else 1
            has_data = 0 if rel and rel["on_time_percentage"] is not None else 1
            on_time = -(rel["on_time_percentage"] if rel and rel["on_time_percentage"] is not None else 0)
            duration = j.get("estimated_duration_mins") or 999
            return (is_direct, has_data, on_time, duration)

        all_journeys.sort(key=sort_key)

    return {
        "origin": {"lat": origin_lat, "lon": origin_lon},
        "destination": {"lat": dest_lat, "lon": dest_lon},
        "origin_stops_searched": len(origin_stops),
        "dest_stops_searched": len(dest_stops),
        "journeys": all_journeys[:20],
        "direct_count": sum(1 for j in all_journeys if j["type"] == "direct"),
        "transfer_count": sum(1 for j in all_journeys if j["type"] == "transfer"),
    }
