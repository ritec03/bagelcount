from fastapi.testclient import TestClient
from app.main import app
from app.services.beancount import BeancountService, get_beancount_service
from unittest.mock import MagicMock

client = TestClient(app)


def test_create_budget():
    """Verify POST /budgets calls the service and returns 200."""
    # Mock the service
    mock_service = MagicMock(spec=BeancountService)
    # BeancountService init args don't matter as we are mocking the instance

    # We need to override the dependency to return our mock
    app.dependency_overrides[get_beancount_service] = lambda: mock_service

    # Payload matching StandardBudget
    payload = {
        "account": "Expenses:Food",
        "amount": "500.00",
        "currency": "USD",
        "start_date": "2024-01-01",
        "frequency": "monthly",
        "tags": ["test"],
    }

    # Note: We need to ensure the app parses this into StandardBudget
    # If the endpoint takes BudgetAllocation (Union), Pydantic should handle it.

    response = client.post("/api/v1/budgets/", json=payload)

    # Assert response
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

    # Assert service called
    mock_service.add_budget.assert_called_once()
    call_args = mock_service.add_budget.call_args[0][0]

    # Verify it parsed correctly
    # Note: imports might be needed inside test or at top if we want to check isinstance
    assert call_args.account == "Expenses:Food"
    assert str(call_args.amount) == "500.00"
    assert call_args.frequency == "monthly"

    # Clean up
    app.dependency_overrides = {}


def test_get_budgets():
    """Verify GET /budgets calls the service and returns list."""
    mock_service = MagicMock(spec=BeancountService)
    app.dependency_overrides[get_beancount_service] = lambda: mock_service

    # Mock return value
    from app.models.domain import StandardBudget
    from datetime import date
    from decimal import Decimal

    mock_budget = StandardBudget(
        account="Expenses:Food",
        amount=Decimal("100.00"),
        start_date=date(2024, 1, 1),
        frequency="monthly",
    )
    mock_service.get_active_budgets.return_value = [mock_budget]

    response = client.get("/api/v1/budgets/")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["account"] == "Expenses:Food"
    assert data[0]["amount"] == "100.00"

    app.dependency_overrides = {}


def test_create_budget_validation_error():
    """Verify 422 if neither frequency nor end_date is provided."""
    payload = {
        "account": "Expenses:Food",
        "amount": "500.00",
        "currency": "USD",
        "start_date": "2024-01-01",
        # Missing frequency/end_date checks
    }
    response = client.post("/api/v1/budgets/", json=payload)
    assert response.status_code == 422


def test_get_budgets_filtering_params():
    """Verify query params are passed to service."""
    mock_service = MagicMock(spec=BeancountService)
    app.dependency_overrides[get_beancount_service] = lambda: mock_service
    mock_service.get_active_budgets.return_value = []

    # Call with params
    client.get("/api/v1/budgets/?start_date=2024-01-01&end_date=2024-01-31")

    mock_service.get_active_budgets.assert_called_once()
    kwargs = mock_service.get_active_budgets.call_args[1]
    assert str(kwargs["start_date"]) == "2024-01-01"
    assert str(kwargs["end_date"]) == "2024-01-31"

    app.dependency_overrides = {}


def test_create_budget_consistency_validation():
    """Verify 400 if child budget exceeds parent."""
    mock_service = MagicMock(spec=BeancountService)
    app.dependency_overrides[get_beancount_service] = lambda: mock_service

    # Setup existing hierarchy: Parent has 100
    from app.models.domain import StandardBudget
    from datetime import date
    from decimal import Decimal

    parent = StandardBudget(
        account="Expenses:Food",
        amount=Decimal("100.00"),
        start_date=date(2024, 1, 1),
        frequency="monthly",
    )
    mock_service.get_active_budgets.return_value = [parent]

    # Try to add Child with 150
    payload = {
        "account": "Expenses:Food:Groceries",
        "amount": "150.00",
        "currency": "USD",
        "start_date": "2024-01-01",
        "frequency": "monthly",
    }

    response = client.post("/api/v1/budgets/", json=payload)

    assert response.status_code == 400
    assert "Exceeds parent budget" in response.json()["detail"]

    app.dependency_overrides = {}
