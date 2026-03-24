from __future__ import annotations

import os
import json
from datetime import datetime, date, timedelta, timezone
from typing import Optional, Iterable

from dotenv import load_dotenv, find_dotenv
from sqlalchemy import text
from sqlalchemy.engine import Engine

from google.transit import gtfs_realtime_pb2

from src.common.db import get_engine

load_dotenv(find_dotenv())

FEED_NAME = "TripUpdates"


def _parse_service_date(trip_desc) -> Optional[date]:
    sd = getattr(trip_desc, "start_date", None)
    if not sd:
        return None
    try:
        return datetime.strptime(sd, "%Y%m%d").date()
    except ValueError:
        return None


def _scheduled_ts_from_static(service_date: date, arrival_time_text: str) -> datetime:
    hh, mm, ss = arrival_time_text.split(":")
    hh_i = int(hh)
    mm_i = int(mm)
    ss_i = int(ss)

    day_offset = hh_i // 24
    hour = hh_i % 24

    return datetime(
        service_date.year,
        service_date.month,
        service_date.day,
        hour,
        mm_i,
        ss_i,
        tzinfo=timezone.utc,
    ) + timedelta(days=day_offset)


def _get_last_processed_ts(conn):
    r = conn.execute(
        text("SELECT MAX(fetched_at) FROM analytics.trip_delay_events")
    ).scalar()
    return r


def _fetch_new_snapshots(conn, after_ts, limit: int = 200) -> list[tuple]:
    if after_ts:
        rows = conn.execute(
            text("""
                SELECT id, fetched_at, raw_pb
                FROM gtfs_rt.feed_snapshots
                WHERE feed_name = :feed_name
                  AND raw_pb IS NOT NULL
                  AND fetched_at > :after_ts
                ORDER BY id
                LIMIT :limit
            """),
            {"feed_name": FEED_NAME, "after_ts": after_ts, "limit": limit},
        ).fetchall()
    else:
        rows = conn.execute(
            text("""
                SELECT id, fetched_at, raw_pb
                FROM gtfs_rt.feed_snapshots
                WHERE feed_name = :feed_name
                  AND raw_pb IS NOT NULL
                ORDER BY id
                LIMIT :limit
            """),
            {"feed_name": FEED_NAME, "limit": limit},
        ).fetchall()
    return rows


def _lookup_static_fields(conn, trip_id: str, stop_id: str) -> tuple[Optional[str], Optional[int], Optional[str]]:
    row = conn.execute(
        text("""
            SELECT t.route_id,
                   st.stop_sequence,
                   st.arrival_time
            FROM gtfs_static.stop_times st
            JOIN gtfs_static.trips t
              ON t.trip_id = st.trip_id
            WHERE st.trip_id = :trip_id
              AND st.stop_id = :stop_id
            LIMIT 1
        """),
        {"trip_id": trip_id, "stop_id": stop_id},
    ).fetchone()

    if not row:
        return None, None, None

    return row[0], row[1], row[2]


def _insert_event(
    conn,
    *,
    snapshot_id: int,
    fetched_at: datetime,
    trip_id: str,
    stop_id: str,
    service_date: Optional[date],
    predicted_arrival_ts: datetime,
    route_id: Optional[str],
    stop_sequence: Optional[int],
    scheduled_arrival_ts: Optional[datetime],
    delay_seconds: Optional[int],
    lead_time_seconds: Optional[int],
) -> None:
    conn.execute(
        text("""
            INSERT INTO analytics.trip_delay_events (
                snapshot_id, fetched_at, feed_name,
                trip_id, route_id, stop_id, service_date,
                scheduled_arrival_ts, predicted_arrival_ts,
                delay_seconds, prediction_lead_time_seconds,
                stop_sequence
            )
            VALUES (
                :snapshot_id, :fetched_at, :feed_name,
                :trip_id, :route_id, :stop_id, :service_date,
                :scheduled_arrival_ts, :predicted_arrival_ts,
                :delay_seconds, :lead_time_seconds,
                :stop_sequence
            )
            ON CONFLICT (snapshot_id, trip_id, stop_id) DO NOTHING
        """),
        {
            "snapshot_id": snapshot_id,
            "fetched_at": fetched_at,
            "feed_name": FEED_NAME,
            "trip_id": trip_id,
            "route_id": route_id,
            "stop_id": stop_id,
            "service_date": service_date,
            "scheduled_arrival_ts": scheduled_arrival_ts,
            "predicted_arrival_ts": predicted_arrival_ts,
            "delay_seconds": delay_seconds,
            "lead_time_seconds": lead_time_seconds,
            "stop_sequence": stop_sequence,
        },
    )


def build_trip_delay_events(batch_limit: int = 200) -> int:
    engine = get_engine()
    inserted = 0

    with engine.begin() as conn:
        after_ts = _get_last_processed_ts(conn)

        snapshots = _fetch_new_snapshots(conn, after_ts=after_ts, limit=batch_limit)
        if not snapshots:
            return 0

        for snapshot_id, fetched_at, raw_pb in snapshots:
            feed = gtfs_realtime_pb2.FeedMessage()
            feed.ParseFromString(raw_pb)

            for ent in feed.entity:
                if not ent.HasField("trip_update"):
                    continue

                tu = ent.trip_update
                trip_id = tu.trip.trip_id
                if not trip_id:
                    continue

                service_date = _parse_service_date(tu.trip)

                for stu in tu.stop_time_update:
                    stop_id = stu.stop_id
                    if not stop_id:
                        continue

                    pred_time = None
                    if stu.HasField("arrival") and stu.arrival.time:
                        pred_time = int(stu.arrival.time)
                    elif stu.HasField("departure") and stu.departure.time:
                        pred_time = int(stu.departure.time)

                    if not pred_time:
                        continue

                    predicted_arrival_ts = datetime.fromtimestamp(pred_time, tz=timezone.utc)

                    route_id, stop_sequence, arrival_time_text = _lookup_static_fields(conn, trip_id, stop_id)

                    scheduled_arrival_ts = None
                    delay_seconds = None
                    if service_date and arrival_time_text:
                        scheduled_arrival_ts = _scheduled_ts_from_static(service_date, arrival_time_text)
                        delay_seconds = int((predicted_arrival_ts - scheduled_arrival_ts).total_seconds())

                    lead_time_seconds = int((predicted_arrival_ts - fetched_at).total_seconds())

                    _insert_event(
                        conn,
                        snapshot_id=snapshot_id,
                        fetched_at=fetched_at,
                        trip_id=trip_id,
                        stop_id=stop_id,
                        service_date=service_date,
                        predicted_arrival_ts=predicted_arrival_ts,
                        route_id=route_id,
                        stop_sequence=stop_sequence,
                        scheduled_arrival_ts=scheduled_arrival_ts,
                        delay_seconds=delay_seconds,
                        lead_time_seconds=lead_time_seconds,
                    )
                    inserted += 1

    return inserted


def main():
    n = build_trip_delay_events(batch_limit=int(os.getenv("DELAY_EVENTS_BATCH", "200")))
    print(f"Inserted {n} delay events")


if __name__ == "__main__":
    main()
