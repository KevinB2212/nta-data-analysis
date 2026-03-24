from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routers import routes, stops, trips, search, analytics

app = FastAPI(
    title="Jump App API",
    description="API for Ireland public transport reliability analysis",
    version="0.1.0",
)

# need CORS so the react frontend (port 3000/5173) can talk to the api
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# each router handles a different part of the api
app.include_router(routes.router, prefix="/api/routes", tags=["routes"])
app.include_router(stops.router, prefix="/api/stops", tags=["stops"])
app.include_router(trips.router, prefix="/api/trips", tags=["trips"])
app.include_router(search.router, prefix="/api/search", tags=["search"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])


@app.get("/")
def root():
    return {"message": "Jump App API", "docs": "/docs"}


# quick endpoint to check if the server is up
@app.get("/health")
def health_check():
    return {"status": "healthy"}
