import os
import requests
from dotenv import load_dotenv, find_dotenv
from google.transit import gtfs_realtime_pb2


def test_tripupdates_endpoint_returns_gtfsr():
    load_dotenv(find_dotenv())

    url = os.getenv("NTA_GTFSR_TRIPUPDATES_URL")
    api_key = os.getenv("NTA_API_KEY")

    assert url, "NTA_GTFSR_TRIPUPDATES_URL not set"
    assert api_key, "NTA_API_KEY not set"

    r = requests.get(
        url,
        params={"subscription-key": api_key},
        timeout=(5, 20),
    )

    assert r.status_code == 200
    assert r.headers.get("Content-Type") == "application/protobuf"

    feed = gtfs_realtime_pb2.FeedMessage()
    feed.ParseFromString(r.content)

    assert len(feed.entity) > 0