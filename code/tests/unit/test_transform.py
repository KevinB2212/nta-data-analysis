from datetime import date
import pytest

from ingestion.static_gtfs.transform import yyyymmdd_to_date, time_to_seconds, empty_to_none


def test_empty_to_none():
    assert empty_to_none("") is None
    assert empty_to_none("   ") is None
    assert empty_to_none(None) is None
    assert empty_to_none("abc") == "abc"

def test_yyyymmdd_to_date():
    assert yyyymmdd_to_date("20260130") == date(2026, 1, 30)
    assert yyyymmdd_to_date(" 20260130 ") == date(2026, 1, 30)
    assert yyyymmdd_to_date("") is None
    assert yyyymmdd_to_date(None) is None

def test_time_to_seconds_standard():
    assert time_to_seconds("00:00:00") == 0
    assert time_to_seconds("01:02:03") == 3723  # 1*3600 + 2*60 + 3

def test_time_to_seconds_over_24h():
    assert time_to_seconds("25:10:00") == 25 * 3600 + 10 * 60
    assert time_to_seconds("100:00:00") == 100 * 3600

def test_time_to_seconds_empty_or_bad():
    assert time_to_seconds("") is None
    assert time_to_seconds(None) is None
    assert time_to_seconds("bad") is None