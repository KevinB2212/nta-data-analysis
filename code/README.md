## Project Overview

This project implements an end-to-end data engineering pipeline for analysing
National Transport Authority (NTA) GTFS static data.

The system:
- Ingests GTFS static feeds
- Validates and transforms the data
- Loads it into PostgreSQL using transactional safety
- Tracks ingestion runs for reliability and auditability
- Supports analytical querying via a structured schema design

## Architecture

The project follows a layered data architecture:

- **Raw layer**: Original GTFS ZIP files stored unchanged
- **Staging layer**: Temporary tables used for validation and safe loading
- **Core layer**: Cleaned, relational GTFS tables
- **Analytics layer**: Derived and operational metadata (e.g. ingestion runs)

This design prevents partial loads and supports repeatable ingestion.

## Database Design

Schemas are used to separate concerns:

- `gtfs_static` – GTFS reference and schedule data
- `gtfs_static_staging` – Temporary staging tables for ingestion
- `analytics` – Operational metadata (ingestion runs)
- `gtfs_rt` – Reserved for future real-time data

Key design decisions:
- UUID primary keys for ingestion tracking
- Transactional loading to avoid partial data
- Indexes on high-cardinality and join-heavy columns

## Database Migrations

All schema changes are managed using Alembic.

Common commands:

```bash
alembic -c db/alembic.ini upgrade head
alembic -c db/alembic.ini revision -m "description"

## GTFS Static Ingestion Pipeline

The ingestion pipeline follows four stages:

1. **Download**
   - Fetches GTFS ZIP from `NTA_GTFS_STATIC_URL`
   - Stores raw artifact with timestamp
   - Creates an `analytics.ingestion_runs` entry (status = started)

2. **Validation**
   - Checks required GTFS files and columns
   - Validates date and time formats
   - Fails fast with error logging

3. **Transform**
   - Converts dates to DATE
   - Normalises empty values to NULL
   - Preserves GTFS semantics (e.g. time > 24h)

4. **Load**
   - Loads into staging tables inside a transaction
   - Validates row counts and constraints
   - Merges into final tables
   - Updates ingestion status to success or failure


## Testing Strategy

NTA Data Analysis uses a layered testing approach aligned with the architecture of the system.

The project combines data ingestion, database pipelines, realtime API integration, and machine learning.  
Testing therefore focuses on validating correctness at multiple levels rather than only unit-level logic.

---

### What Is Tested

**1. Transformation and Validation Logic**

Core utility functions are tested to ensure:

- Correct parsing of GTFS date formats (YYYYMMDD)
- Correct conversion of GTFS times (including >24 hour values)
- Proper handling of empty or optional fields
- Validation of static GTFS archive structure

These tests are deterministic and do not require database or network access.

---

**2. Static GTFS Ingestion Pipeline**

The static ingestion pipeline is tested end-to-end against a live PostgreSQL database.

Tests verify that:

- Ingestion completes successfully
- A run is recorded in `analytics.ingestion_runs`
- Core GTFS tables are populated (`routes`, `stops`, `trips`, `stop_times`)
- Logged row counts match actual database state

This ensures database integrity and ingestion reliability.

---

**3. External API Compatibility**

The GTFS-Realtime TripUpdates endpoint is validated to ensure:

- HTTP 200 responses
- Correct protobuf content type
- Successful parsing into a `FeedMessage`
- Presence of realtime entities

This confirms compatibility with the external NTA API.

---

### Operational Validation

In addition to automated tests, the system records:

- Ingestion runs
- Realtime feed snapshots
- Derived delay events
- Model training metrics

These logs allow ongoing verification of:

- Pipeline health
- Data growth
- Model performance over time

---

### Running Tests

From the project root:

```bash
pytest -q


Repository Structure
The code/ directory represents the root of our NTA data anlysis, other top level directories are simply course work pertaining to our project

## Environment Setup

Required environment variables:

- `DATABASE_URL`
- `NTA_GTFS_STATIC_URL`

Example:
```env
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5433/nta_data_analysis
NTA_GTFS_STATIC_URL=https://...


