# Testing – NTA Data Analysis

This directory contains the automated test suite for the NTA Data Analysis project.

The system is a data engineering and machine learning pipeline that:

- Ingests GTFS static timetable data
- Polls GTFS-Realtime TripUpdates
- Stores raw snapshots
- Builds derived delay events
- Trains and evaluates a predictive delay model

The test suite validates correctness across these layers using **pytest**.

---

## Testing Approach

The tests are structured to reflect the architecture of the system.  
They validate:

1. Core transformation and validation logic
2. Static GTFS ingestion into PostgreSQL
3. Compatibility with the external NTA GTFS-Realtime API

The goal is to ensure correctness at both function level and system level.

---

## What Is Covered

### 1. Transformation Logic

Core data transformation utilities are tested to ensure correct normalisation before database insertion.

This includes:

- Converting empty strings to `None`
- Parsing GTFS date format (YYYYMMDD)
- Converting GTFS times to seconds since midnight
- Supporting extended GTFS times (e.g. `25:10:00`)

These tests are deterministic and do not require external services.

---

### 2. Static GTFS Validation

The static GTFS archive validator is tested to ensure:

- Required files exist (`stops.txt`, `routes.txt`, `trips.txt`, `stop_times.txt`, `calendar.txt`)
- Date formats are valid
- Invalid archives raise appropriate exceptions

This prevents corrupt data from entering the ingestion pipeline.

---

### 3. Static Ingestion Pipeline

End-to-end ingestion tests validate that:

- Static GTFS ingestion completes successfully
- A row is recorded in `analytics.ingestion_runs`
- The run status is marked as `success`
- Core GTFS tables contain rows:
  - `gtfs_static.routes`
  - `gtfs_static.stops`
  - `gtfs_static.trips`
  - `gtfs_static.stop_times`
- Logged row counts match actual database state

These tests require a running PostgreSQL instance.

---

### 4. External API Contract Testing

The GTFS-Realtime TripUpdates endpoint is validated to ensure:

- HTTP 200 response
- `Content-Type` is `application/protobuf`
- Payload parses into a valid `FeedMessage`
- At least one entity is present in the feed

These tests verify compatibility with the external NTA API.

Note: Contract tests depend on network availability and a valid API key.

---

## Running the Tests

Run all tests:

```bash
pytest -q