import csv
from pathlib import Path
from zipfile import ZipFile
import pytest

from src.ingestion.static_gtfs.validate import validate_zip

def _write_csv(path: Path, header: list[str], rows: list[list[str]]):
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)

def _make_minimal_gtfs_zip(tmp_path: Path, include_calendar_dates: bool = False) -> Path:
    # Create temp files
    agency = tmp_path / "agency.txt"
    routes = tmp_path / "routes.txt"
    stops = tmp_path / "stops.txt"
    trips = tmp_path / "trips.txt"
    stop_times = tmp_path / "stop_times.txt"
    calendar = tmp_path / "calendar.txt"

    _write_csv(agency, ["agency_name","agency_url","agency_timezone"], [["Test Agency","https://x.ie","Europe/Dublin"]])
    _write_csv(routes, ["route_id","route_type"], [["R1","3"]])
    _write_csv(stops, ["stop_id","stop_name"], [["S1","Stop 1"]])
    _write_csv(trips, ["trip_id","route_id","service_id"], [["T1","R1","WKD"]])
    _write_csv(stop_times, ["trip_id","stop_id","stop_sequence","arrival_time","departure_time"],
              [["T1","S1","1","25:10:00","25:10:00"]])
    _write_csv(calendar,
               ["service_id","monday","tuesday","wednesday","thursday","friday","saturday","sunday","start_date","end_date"],
               [["WKD","1","1","1","1","1","0","0","20260101","20261231"]])

    # Zip them
    zip_path = tmp_path / "test_gtfs.zip"
    with ZipFile(zip_path, "w") as z:
        for f in [agency, routes, stops, trips, stop_times, calendar]:
            z.write(f, arcname=f.name)

        if include_calendar_dates:
            cd = tmp_path / "calendar_dates.txt"
            _write_csv(cd, ["service_id","date","exception_type"], [["WKD","20260115","2"]])
            z.write(cd, arcname=cd.name)

    return zip_path

def test_validate_zip_success(tmp_path: Path):
    zip_path = _make_minimal_gtfs_zip(tmp_path)
    validate_zip(zip_path)  # should not raise

def test_validate_zip_missing_required_file(tmp_path: Path):
    # Make an empty zip
    zip_path = tmp_path / "bad.zip"
    with ZipFile(zip_path, "w"):
        pass

    with pytest.raises(ValueError):
        validate_zip(zip_path)

def test_validate_zip_bad_date_format(tmp_path: Path):
    zip_path = _make_minimal_gtfs_zip(tmp_path)
    bad_zip = tmp_path / "bad_date.zip"

    with ZipFile(zip_path) as z_in, ZipFile(bad_zip, "w") as z_out:
        for name in z_in.namelist():
            data = z_in.read(name)
            if name == "calendar.txt":
                text = data.decode("utf-8").replace("20260101", "2026-01-01")
                data = text.encode("utf-8")
            z_out.writestr(name, data)

    with pytest.raises(ValueError):
        validate_zip(bad_zip)