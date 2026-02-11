import pytest
import shutil
from pathlib import Path
from fastapi.testclient import TestClient
from app.main import app
from app.services.beancount import get_beancount_service, BeancountService

# Path to our sample data
SAMPLE_LEDGER_PATH = Path("sample_ledger.beancount")


@pytest.fixture
def test_client_with_sample(tmp_path):
    """
    Creates a temporary copy of the sample ledger and overrides the
    BeancountService dependency to use it.
    """
    # 1. Prepare temp file
    if not SAMPLE_LEDGER_PATH.exists():
        pytest.fail(f"Sample ledger not found at {SAMPLE_LEDGER_PATH.absolute()}")

    temp_ledger = tmp_path / "main.bean"
    shutil.copy(SAMPLE_LEDGER_PATH, temp_ledger)

    # 2. Configure Service to use temp file
    # We use the real BeancountService logic, but pointing to our temp file
    service = BeancountService(str(temp_ledger))

    # 3. Override Dependency
    app.dependency_overrides[get_beancount_service] = lambda: service

    client = TestClient(app)
    yield client, temp_ledger

    # 4. Cleanup
    app.dependency_overrides = {}


def test_scenario_accounts(test_client_with_sample):
    """Verify we can retrieve the active accounts from the sample."""
    client, _ = test_client_with_sample

    response = client.get("/api/v1/accounts/")
    assert response.status_code == 200

    accounts = response.json()
    # In sample_ledger:
    # Assets:Checking, Assets:Cash, Expenses:Food, Expenses:Rent, Expenses:Utilities, Income:Salary, Equity:Opening-Balances
    # Total 7 open accounts
    assert len(accounts) == 7

    names = {a["name"] for a in accounts}
    assert "Assets:Checking" in names
    assert "Expenses:Rent" in names
    assert "Income:Salary" in names

    # Edge Case: Closed Accounts
    # Assets:OldBank was closed in 2023, so it should NOT be in the active list
    assert "Assets:OldBank" not in names


def test_scenario_transactions(test_client_with_sample):
    """Verify we can retrieve transactions and details are correct."""
    client, _ = test_client_with_sample

    response = client.get("/api/v1/transactions/")
    assert response.status_code == 200

    txns = response.json()

    # Sample file has:
    # 1 Opening Balance
    # 6 Transactions in Jan 2024 (Employer, Landlord, Kroger x2, Comcast, Trader Joes)
    # 2 Transactions in edge cases (Future Cafe, Walmart split)
    # Total = 1 + 6 + 2 = 9 transactions
    assert len(txns) == 9

    # Edge Case: Future Transactions
    # Verify the Feb 1st transaction is included
    future_txn = next((t for t in txns if t["payee"] == "Future Cafe"), None)
    assert future_txn is not None
    assert future_txn["date"] == "2024-02-01"

    # Edge Case: Multi-Split Handling
    # 2024-01-25 * "Walmart" "Supplies and Food"
    walmart_txn = next(t for t in txns if t["payee"] == "Walmart")
    assert walmart_txn["narration"] == "Supplies and Food"
    # Verify it has exactly 3 splits (as requested by user)
    assert len(walmart_txn["postings"]) == 3

    # Verify postings content & amounts explicitly
    postings = walmart_txn["postings"]
    food = next(p for p in postings if p["account"] == "Expenses:Food")
    utilities = next(p for p in postings if p["account"] == "Expenses:Utilities")
    checking = next(p for p in postings if p["account"] == "Assets:Checking")

    assert food["units"] == "50.00"
    assert utilities["units"] == "20.00"
    assert checking["units"] == "-70.00"


def test_scenario_write_budget(test_client_with_sample):
    """Verify we can write a new budget and it persists."""
    client, temp_ledger = test_client_with_sample

    payload = {
        "account": "Expenses:Utilities",
        "amount": "120.00",
        "currency": "USD",
        "start_date": "2024-02-01",
        "frequency": "monthly",
    }

    # 1. Write
    response = client.post("/api/v1/budgets/", json=payload)
    assert response.status_code == 200

    # 2. Verify File Content
    content = temp_ledger.read_text()

    # We check for the account and amount, and metadata presence
    # The date will be today's date
    assert 'custom "budget" Expenses:Utilities 120.00 USD' in content
    assert 'start_date: "2024-02-01"' in content
    assert 'frequency: "monthly"' in content
