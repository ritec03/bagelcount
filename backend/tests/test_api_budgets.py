from fastapi.testclient import TestClient
from app.main import app
from app.services.beancount import BeancountService, get_beancount_service
from app.models.domain import BudgetAllocation
from beancount import loader
from unittest.mock import MagicMock

client = TestClient(app)

def test_create_budget():
    """Verify POST /budgets calls the service and returns 200."""
    # Mock the service
    mock_service = MagicMock(spec=BeancountService)
    # BeancountService init args don't matter as we are mocking the instance
    
    # We need to override the dependency to return our mock
    app.dependency_overrides[get_beancount_service] = lambda: mock_service
    
    payload = {
        "account": "Expenses:Food",
        "amount": "500.00",
        "currency": "USD",
        "period": "2024-01-01"
    }
    
    response = client.post("/api/v1/budgets/", json=payload)
    
    # Assert response
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    
    # Assert service called
    mock_service.add_budget.assert_called_once()
    call_args = mock_service.add_budget.call_args[0][0]
    assert isinstance(call_args, BudgetAllocation)
    assert call_args.account == "Expenses:Food"
    assert str(call_args.amount) == "500.00"
    
    # Clean up
    app.dependency_overrides = {}
