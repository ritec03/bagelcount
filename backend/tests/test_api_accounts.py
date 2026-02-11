from fastapi.testclient import TestClient
from app.main import app
from app.services.beancount import BeancountService, get_beancount_service
from beancount import loader

client = TestClient(app)


def mock_beancount_service_accounts():
    """Mock service with accounts."""
    content = """
2024-01-01 open Assets:Checking USD
2024-01-01 open Expenses:Food USD
"""
    return BeancountService(content, loader_func=loader.load_string)


def test_get_accounts():
    """Verify endpoint returns list of accounts."""
    # Override dependency
    app.dependency_overrides[get_beancount_service] = mock_beancount_service_accounts

    response = client.get("/api/v1/accounts/")
    assert response.status_code == 200

    data = response.json()
    assert len(data) == 2
    names = {a["name"] for a in data}
    assert "Assets:Checking" in names
    assert "Expenses:Food" in names

    # Clean up override
    app.dependency_overrides = {}
