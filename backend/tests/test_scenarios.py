import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.beancount import get_beancount_service, BeancountService

# Embedded sample ledger content
SAMPLE_LEDGER_CONTENT = """
option "title" "BagelCount Sample Ledger"
option "operating_currency" "CAD"

; --- Accounts ---
2023-01-01 open Assets:Checking     CAD
2023-01-01 open Assets:Cash         CAD
2023-01-01 open Expenses:Food       CAD
2023-01-01 open Expenses:Food:Restaurants       CAD
2023-01-01 open Expenses:Food:Restaurants:ExpensiveRestaurant       CAD
2023-01-01 open Expenses:Food:CoffeeShops       CAD
2023-01-01 open Expenses:Rent       CAD
2023-01-01 open Expenses:Utilities  CAD
2023-01-01 open Income:Salary       CAD
2023-01-01 open Equity:Opening-Balances CAD
2023-01-01 open Assets:OldBank      CAD
2023-12-31 close Assets:OldBank

; --- Opening Balances ---
2023-12-31 * "Opening Balance"
  Assets:Checking           5000.00 CAD
  Equity:Opening-Balances

; --- Budgets for Jan 2024 ---
2026-02-01 custom "budget" Expenses:Food      600.00 USD
  frequency: "monthly"
  start_date: "2026-02-01"
  created_at: "1704067200"

2026-02-01 custom "budget" Expenses:Rent     1500.00 USD
  frequency: "monthly"
  start_date: "2026-02-01"
  created_at: "1704067200"

2026-02-01 * "Employer" "Salary"
  Assets:Checking           3000.00 CAD
  Income:Salary

2026-02-02 * "Landlord" "Rent Payment"
  Expenses:Rent             1500.00 CAD
  Assets:Checking

2026-02-05 * "Kroger" "Weekly Groceries"
  Expenses:Food              150.00 CAD
  Assets:Checking

2026-02-10 * "Comcast" "Internet"
  Expenses:Utilities          80.00 CAD
  Assets:Checking

2026-02-15 * "Trader Joes" "More Groceries"
  Expenses:Food               75.50 CAD
  Assets:Checking

2026-02-20 * "Kroger" "Snacks"
  Expenses:Food               25.00 CAD
  Assets:Cash

; --- Edge/Corner Cases ---
; 1. Future Transaction
2026-02-01 * "Future Cafe" "Coffee"
  Expenses:Food:CoffeeShops               5.00 CAD
  Assets:Cash

; 2. Multi-split transaction
2024-01-25 * "Walmart" "Supplies and Food"
  Expenses:Food               50.00 CAD
  Expenses:Utilities          20.00 CAD ; Light bulbs
  Assets:Checking            -70.00 CAD

2026-02-05 custom "budget" Expenses:Food:CoffeeShops 100 CAD
  start_date: "2026-02-01"
  created_at: "1770327567"
  frequency: "monthly"
"""


@pytest.fixture
def test_client_with_sample(tmp_path):
    """
    Creates a temporary ledger file from embedded content and overrides the
    BeancountService dependency to use it.
    """
    # 1. Prepare temp file
    temp_ledger = tmp_path / "main.bean"
    temp_budget = tmp_path / "budgets.bean"

    # Write embedded content to temp file
    temp_ledger.write_text(SAMPLE_LEDGER_CONTENT, encoding="utf-8")
    temp_budget.write_text("", encoding="utf-8")

    # 2. Configure Service to use temp file
    # We use the real BeancountService logic, but pointing to our temp file
    service = BeancountService(str(temp_ledger), budget_file=str(temp_budget))

    # 3. Override Dependency
    app.dependency_overrides[get_beancount_service] = lambda: service

    client = TestClient(app)
    yield client, (temp_ledger, temp_budget)

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
    # + Expenses:Food:Restaurants, Expenses:Food:Restaurants:ExpensiveRestaurant, Expenses:Food:CoffeeShops
    # Total 10 open accounts
    assert len(accounts) == 10

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
    # Verify the Feb 1st transaction is included (Note: Sample uses 2026)
    future_txn = next((t for t in txns if t["payee"] == "Future Cafe"), None)
    assert future_txn is not None
    assert future_txn["date"] == "2026-02-01"

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
    # Unpack tuple
    client, (temp_ledger, temp_budget) = test_client_with_sample

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

    # 2. Verify File Content (Check Segregated Budget File)
    content = temp_budget.read_text()

    # We check for the account and amount, and metadata presence
    # The date will be today's date
    assert 'custom "budget" Expenses:Utilities 120.00 USD' in content
    assert 'start_date: "2024-02-01"' in content
    assert 'frequency: "monthly"' in content
