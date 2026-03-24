import hashlib
import json
import os
import time
from datetime import datetime, timezone
from typing import Optional, Tuple

import requests
from dotenv import load_dotenv, find_dotenv
from sqlalchemy import text

from google.transit import gtfs_realtime_pb2
from src.common.db import get_engine


load_dotenv(find_dotenv())


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def parse_entity_count_and_timestamp(payload: bytes) -> Tuple[int, Optional[int]]:
    feed = gtfs_realtime_pb2.FeedMessage()
    feed.ParseFromString(payload)
    entity_count = len(feed.entity)
    feed_ts = getattr(feed.header, "timestamp", None)
    return entity_count, feed_ts


def fetch_feed(
    session: requests.Session,
    url: str,
    api_key: str,
    auth_mode: str,
    api_key_header: str,
    api_key_query_param: str,
    etag: Optional[str],
) -> requests.Response:
    headers: dict[str, str] = {}
    params: dict[str, str] = {}

    if etag:
        headers["If-None-Match"] = etag

    mode = (auth_mode or "query").strip().lower()

    if mode in ("header", "both"):
        headers[api_key_header] = api_key

    if mode in ("query", "both"):
        params[api_key_query_param] = api_key

    return session.get(url, headers=headers, params=params, timeout=(5, 20))


def insert_snapshot(
    conn,
    feed_name: str,
    fetched_at: datetime,
    http_status: Optional[int],
    etag: Optional[str],
    content_hash: Optional[str],
    raw_pb: Optional[bytes],
    entity_count: Optional[int],
    feed_timestamp: Optional[int],
    error: Optional[str],
) -> None:
    conn.execute(
        text(
            """
            INSERT INTO gtfs_rt.feed_snapshots
            (feed_name, fetched_at, http_status, etag, content_hash, raw_pb, entity_count, feed_timestamp, error)
            VALUES
            (:feed_name, :fetched_at, :http_status, :etag, :content_hash, :raw_pb, :entity_count, :feed_timestamp, :error)
            """
        ),
        {
            "feed_name": feed_name,
            "fetched_at": fetched_at,
            "http_status": http_status,
            "etag": etag,
            "content_hash": content_hash,
            "raw_pb": raw_pb,
            "entity_count": entity_count,
            "feed_timestamp": feed_timestamp,
            "error": error,
        },
    )


def main() -> None:
    url = os.getenv("NTA_GTFSR_TRIPUPDATES_URL")
    api_key = os.getenv("NTA_API_KEY")

    auth_mode = os.getenv("NTA_API_KEY_MODE", "query")

    api_key_header = os.getenv("NTA_API_KEY_HEADER", "Ocp-Apim-Subscription-Key")

    api_key_query_param = os.getenv("NTA_API_KEY_QUERY_PARAM", "subscription-key")

    poll_seconds = int(os.getenv("GTFS_RT_POLL_SECONDS", "30"))
    feed_name = os.getenv("GTFS_RT_FEED_NAME", "TripUpdates")

    if not url:
        raise RuntimeError("NTA_GTFSR_TRIPUPDATES_URL is not set")
    if not api_key:
        raise RuntimeError("NTA_API_KEY is not set")

    engine = get_engine()
    session = requests.Session()

    last_etag: Optional[str] = None

    next_run = time.monotonic()

    while True:
        next_run += poll_seconds
        fetched_at = _now_utc()

        with engine.begin() as conn:
            try:
                resp = fetch_feed(
                    session=session,
                    url=url,
                    api_key=api_key,
                    auth_mode=auth_mode,
                    api_key_header=api_key_header,
                    api_key_query_param=api_key_query_param,
                    etag=last_etag,
                )

                status = resp.status_code
                etag = resp.headers.get("ETag")

                if status == 304:
                    insert_snapshot(
                        conn=conn,
                        feed_name=feed_name,
                        fetched_at=fetched_at,
                        http_status=status,
                        etag=etag,
                        content_hash=None,
                        raw_pb=None,
                        entity_count=0,
                        feed_timestamp=None,
                        error=None,
                    )

                elif 200 <= status < 300:
                    payload = resp.content

                    if payload[:1] == b"<":
                        insert_snapshot(
                            conn=conn,
                            feed_name=feed_name,
                            fetched_at=fetched_at,
                            http_status=status,
                            etag=etag,
                            content_hash=None,
                            raw_pb=None,
                            entity_count=None,
                            feed_timestamp=None,
                            error="Response looks like HTML, not protobuf (check URL/auth).",
                        )
                    else:
                        h = _sha256(payload)
                        entity_count, feed_ts = parse_entity_count_and_timestamp(payload)

                        insert_snapshot(
                            conn=conn,
                            feed_name=feed_name,
                            fetched_at=fetched_at,
                            http_status=status,
                            etag=etag,
                            content_hash=h,
                            raw_pb=payload,
                            entity_count=entity_count,
                            feed_timestamp=feed_ts,
                            error=None,
                        )

                        last_etag = etag or last_etag

                else:
                    body = resp.text
                    insert_snapshot(
                        conn=conn,
                        feed_name=feed_name,
                        fetched_at=fetched_at,
                        http_status=status,
                        etag=etag,
                        content_hash=None,
                        raw_pb=None,
                        entity_count=None,
                        feed_timestamp=None,
                        error=f"HTTP {status}: {body[:500]}",
                    )

            except Exception as e:
                insert_snapshot(
                    conn=conn,
                    feed_name=feed_name,
                    fetched_at=fetched_at,
                    http_status=None,
                    etag=None,
                    content_hash=None,
                    raw_pb=None,
                    entity_count=None,
                    feed_timestamp=None,
                    error=str(e),
                )

        sleep_for = next_run - time.monotonic()
        if sleep_for > 0:
            time.sleep(sleep_for)


if __name__ == "__main__":
    main()