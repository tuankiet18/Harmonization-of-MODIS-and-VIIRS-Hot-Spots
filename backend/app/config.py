"""Settings come from environment variables only, so the same image runs locally, on Render and on Cloud Run."""
import os
from dataclasses import dataclass, field
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent


def _csv(value: str) -> list[str]:
    return [v.strip() for v in value.split(",") if v.strip()]


@dataclass(frozen=True)
class Settings:
    # Folder holding monthly.parquet, daily.parquet, points.parquet and meta.json (see docs/DATA_CONTRACT.md).
    data_dir: Path = field(default_factory=lambda: Path(os.getenv("DATA_DIR", BACKEND_DIR / "data" / "sample")))
    # Origins allowed to call the API from a browser. Use "*" only for throwaway demos.
    cors_origins: list[str] = field(default_factory=lambda: _csv(os.getenv("CORS_ORIGINS", "http://localhost:5173")))
    # "template" needs no key. "llm" is the hook for the AI teammates (see app/explain.py).
    explain_provider: str = field(default_factory=lambda: os.getenv("EXPLAIN_PROVIDER", "template"))
    # Requests per minute per client for /api/explain, because a public demo link can be hammered.
    explain_rate_per_min: int = field(default_factory=lambda: int(os.getenv("EXPLAIN_RATE_PER_MIN", "10")))
    # Hard cap on points returned by /api/points so the map stays fast.
    max_points: int = field(default_factory=lambda: int(os.getenv("MAX_POINTS", "4000")))
    # Hard cap on hexagons returned by /api/hexes.
    max_hexes: int = field(default_factory=lambda: int(os.getenv("MAX_HEXES", "8000")))
    # Hard cap on rows in a CSV export.
    max_export_rows: int = field(default_factory=lambda: int(os.getenv("MAX_EXPORT_ROWS", "500000")))


def get_settings() -> Settings:
    return Settings()
