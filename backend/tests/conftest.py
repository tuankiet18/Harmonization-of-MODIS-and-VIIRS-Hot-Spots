import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import make_sample_data as gen  # noqa: E402
from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402

# One small area (4 x 4 degrees = 16 cells) keeps the fixture fast while covering every code path.
TINY = gen.Region("tiny", -60, -10, -56, -6, 9, 1.0, 3.6)
BOX = {"west": -60, "south": -10, "east": -56, "north": -6}


@pytest.fixture(scope="session")
def data_dir(tmp_path_factory):
    d = tmp_path_factory.mktemp("data")
    gen.build(d, regions=[TINY])
    return d


def make_client(data_dir, **overrides) -> TestClient:
    settings = Settings(data_dir=data_dir, cors_origins=["http://localhost:5173"], **overrides)
    return TestClient(create_app(settings))


@pytest.fixture(scope="session")
def client(data_dir):
    return make_client(data_dir)
