"""
TrustLens AI - Main Application Entry Point
============================================
This is the heart of the FastAPI backend. It:
  - Creates and configures the FastAPI app instance
  - Registers CORS middleware (so the frontend can talk to us)
  - Mounts all route modules (routers)
  - Exposes a /health endpoint for uptime checks

Python 3.11+ compatible.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database.database import engine
from app.database.models import Base

# ---------------------------------------------------------------------------
# App Factory
# ---------------------------------------------------------------------------
# We define the app at module level so Uvicorn can discover it via
#   uvicorn backend.app.main:app --reload
# ---------------------------------------------------------------------------

app = FastAPI(
    title="TrustLens AI",
    description=(
        "AI-powered crowdsourced compensation validation platform. "
        "Detects suspicious salary submissions before they corrupt analytics."
    ),
    version="0.1.0",
    # Swagger UI will be available at /docs
    # ReDoc will be available at /redoc
    docs_url="/docs",
    redoc_url="/redoc",
)

Base.metadata.create_all(bind=engine)

# ---------------------------------------------------------------------------
# CORS Middleware
# ---------------------------------------------------------------------------
# Cross-Origin Resource Sharing (CORS) lets browsers on a *different* origin
# (e.g. http://localhost:3000 for a React dev server) send requests to this
# API. In production, replace "*" with your actual frontend domain(s).
# ---------------------------------------------------------------------------

# TODO: Move this list to an environment variable / config file before prod.
ALLOWED_ORIGINS: list[str] = [
    "http://localhost:3000",   # React / Next.js dev server
    "http://localhost:5173",   # Vite dev server
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    # "https://trustlens.ai", ← add your production domain here
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,         # Allow cookies / Authorization headers
    allow_methods=["*"],            # GET, POST, PUT, DELETE, PATCH, OPTIONS …
    allow_headers=["*"],            # Accept any request header
)

# ---------------------------------------------------------------------------
# Router Registration
# ---------------------------------------------------------------------------
# As the project grows, add feature routers here. Each router lives in its
# own file under backend/app/routers/ and groups related endpoints together.
#
# Example (uncomment as you build each module):
#
#   from backend.app.routers import submissions, analytics, auth, flagging
#
#   app.include_router(auth.router,        prefix="/api/v1/auth",        tags=["Auth"])
#   app.include_router(submissions.router, prefix="/api/v1/submissions", tags=["Submissions"])
#   app.include_router(analytics.router,   prefix="/api/v1/analytics",   tags=["Analytics"])
#   app.include_router(flagging.router,    prefix="/api/v1/flagging",    tags=["Flagging"])
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Health-Check Endpoint
# ---------------------------------------------------------------------------
# A lightweight endpoint used by:
#   • Load balancers / reverse proxies (Nginx, AWS ALB) to confirm the app is up
#   • CI pipelines to verify a successful deployment
#   • Monitoring tools (Uptime Robot, Grafana, etc.)
#
# Always returns 200 OK when the process is running.
# ---------------------------------------------------------------------------

@app.get(
    "/health",
    tags=["Health"],
    summary="Health Check",
    response_description="Returns the current health status of the API.",
)
async def health_check() -> dict[str, str]:
    """
    Confirm the API is alive and reachable.

    Returns:
        A JSON object with a `status` key set to `"ok"`.
    """
    return {"status": "ok", "service": "TrustLens AI"}


@app.get(
    "/model-status",
    tags=["Health"],
    summary="ML Model Status",
)
async def model_status():
    """
    Check whether the ML model is loaded and ready.
    """

    return {
        "model_ready": True,
        "model_name": "Isolation Forest",
        "version": "v1.0"
    }

# ---------------------------------------------------------------------------
# Root Redirect (optional convenience)
# ---------------------------------------------------------------------------
# Visiting "/" in a browser redirects straight to the interactive API docs.
# ---------------------------------------------------------------------------

from fastapi.responses import RedirectResponse  # noqa: E402 – kept near its use


@app.get("/", include_in_schema=False)
async def root() -> RedirectResponse:
    """Redirect root requests to the Swagger UI."""
    return RedirectResponse(url="/docs")

# ---------------------------------------------------------------------------
# Router Registration
# ---------------------------------------------------------------------------
from app.routes.validation import router as validation_router
from app.routes.analytics import router as analytics_router

app.include_router(validation_router, prefix="/api/v1", tags=["Validation"])
app.include_router(analytics_router, prefix="/api/v1", tags=["Analytics"])