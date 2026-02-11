from fastapi.testclient import TestClient
from app.main import app
from app.services.beancount import BeancountService, get_beancount_service
from beancount import loader
import pytest

client = TestClient(app)


def mock_beancount_service():
    """Mock service with pre-loaded string data."""
    content = """
2024-01-01 * "JanFirst" "StartOfMonth"
  Assets:Checking  -10.00 USD
  Expenses:Food     10.00 USD

2024-01-15 * "JanMid" "MiddleOfMonth"
  Assets:Checking  -20.00 USD
  Expenses:Food     20.00 USD

2024-02-01 * "FebFirst" "NextMonth"
  Assets:Checking  -30.00 USD
  Expenses:Food     30.00 USD
"""
    return BeancountService(
        content, budget_file="dummy.bean", loader_func=loader.load_string
    )


@pytest.fixture(autouse=True)
def override_dependency():
    app.dependency_overrides[get_beancount_service] = mock_beancount_service
    yield
    app.dependency_overrides = {}


def test_read_transactions_all():
    """Verify endpoint returns all transactions by default."""
    response = client.get("/api/v1/transactions/")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 3


def test_read_transactions_from_date():
    """Verify filtering by from_date."""
    response = client.get("/api/v1/transactions/?from_date=2024-01-15")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert data[0]["payee"] == "JanMid"
    assert data[1]["payee"] == "FebFirst"


def test_read_transactions_to_date():
    """Verify filtering by to_date."""
    response = client.get("/api/v1/transactions/?to_date=2024-01-15")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert data[0]["payee"] == "JanFirst"
    assert data[1]["payee"] == "JanMid"


def test_read_transactions_range():
    """Verify filtering by date range."""
    response = client.get(
        "/api/v1/transactions/?from_date=2024-01-02&to_date=2024-01-31"
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["payee"] == "JanMid"


def test_read_transactions_empty_range():
    """Verify filtering by date range with no results."""
    response = client.get(
        "/api/v1/transactions/?from_date=2023-01-01&to_date=2023-12-31"
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 0


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
