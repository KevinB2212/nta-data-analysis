# 📊 NTA Data Analysis

> Public transport data analysis pipeline with interactive dashboard — DCU Final Year Project (2026)

## About

A data engineering project that analyses [National Transport Authority (NTA)](https://www.nationaltransport.ie/) datasets to uncover insights into Irish public transport patterns. Features a full ETL pipeline, machine learning analytics, and a React-based dashboard for visualisation.

## Project Structure

```
├── code/
│   ├── src/
│   │   ├── ingestion/     # Data ingestion & ETL pipeline
│   │   ├── analytics/     # Data analysis modules
│   │   ├── api/           # Backend API
│   │   ├── ml/            # Machine learning models
│   │   └── common/        # Shared utilities
│   ├── dashboard/         # React frontend dashboard
│   ├── tests/             # Test suite
│   ├── docker-compose.yml # Container orchestration
│   ├── Makefile           # Build automation
│   └── requirements.txt   # Python dependencies
├── Proposal/              # Project proposal document
├── functional_spec/       # Functional specification
├── technical_spec/        # Technical specification
├── user_manual/           # User manual
├── blog/                  # Development blog
└── Project design/        # Design documents
```

## Tech Stack

- **Backend:** Python, FastAPI
- **Frontend:** TypeScript, React
- **Data:** Pandas, NumPy
- **ML:** Scikit-learn
- **Infrastructure:** Docker, Docker Compose
- **Database:** PostgreSQL
- **Testing:** Pytest

## Getting Started

```bash
cd code
cp .env.example .env          # Configure environment
docker-compose up -d           # Start services
pip install -r requirements.txt
python src/run_pipeline.py     # Run the data pipeline
```

## Documentation

| Document | Description |
|----------|------------|
| [Proposal](./Proposal) | Initial project proposal |
| [Functional Spec](./functional_spec) | Functional specification |
| [Technical Spec](./technical_spec) | Technical specification & architecture |
| [User Manual](./user_manual) | End-user guide |
| [Blog](./blog) | Development blog & progress updates |

## Author

**Kevin** — Computer Science, Dublin City University

---

*DCU CSC1049 — Final Year Project 2026*
