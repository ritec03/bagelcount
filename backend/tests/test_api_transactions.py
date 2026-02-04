from fastapi.testclient import TestClient
from app.main import app
from app.services.beancount import BeancountService, get_beancount_service
from beancount import loader

client = TestClient(app)

def mock_beancount_service():
    """Mock service with pre-loaded string data."""
    content = """
2024-01-01 * "TestPayee" "TestNarration"
  Assets:Checking  100.00 USD
  Expenses:Food
"""
    return BeancountService(content, loader_func=loader.load_string)

def test_read_transactions():
    """Verify endpoint returns transactions from our mock service."""
    # Override dependency
    app.dependency_overrides[get_beancount_service] = mock_beancount_service
    
    response = client.get("/api/v1/transactions/")
    assert response.status_code == 200
    
    data = response.json()
    assert len(data) == 1
    assert data[0]["payee"] == "TestPayee"
    assert data[0]["narration"] == "TestNarration"
    
    # Clean up override
    app.dependency_overrides = {}

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
