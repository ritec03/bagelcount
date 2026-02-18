
import pytest
import os
import time
from unittest.mock import patch, MagicMock
from beancount import loader
from app.services.beancount import BeancountService, get_beancount_service
from app.models.domain import StandardBudget
from decimal import Decimal
from datetime import date

# --- NEW TDD TESTS for Singleton & Smart Reloading ---

@pytest.fixture
def temp_beancount_files(tmp_path):
    main_file = tmp_path / "main.beancount"
    included_file = tmp_path / "sub.beancount"
    budget_file = tmp_path / "budgets.beancount"
    
    # Initialize files
    included_file.write_text('2023-01-01 open Assets:Cash USD\n')
    budget_file.write_text('')
    
    main_content = f'''
option "title" "Test Ledger"
option "operating_currency" "USD"
include "{included_file}"
include "{budget_file}"
2023-01-02 open Expenses:Food USD
'''
    main_file.write_text(main_content)
    
    return {
        "main": str(main_file),
        "included": str(included_file),
        "budget": str(budget_file)
    }

def test_singleton_pattern():
    """Verify get_beancount_service returns the same instance."""
    s1 = get_beancount_service()
    s2 = get_beancount_service()
    assert s1 is s2, "Service should be a singleton"

def test_no_reload_on_repeated_access(temp_beancount_files):
    """Verify load_file is NOT called on repeated access if files haven't changed."""
    paths = temp_beancount_files
    service = BeancountService(paths["main"], paths["budget"])
    
    # 1. First access loads the data
    service.load()
    
    # 2. Mock loader to ensure subsequent calls don't use it
    with patch.object(service, 'loader_func', wraps=service.loader_func) as mock_loader:
        # Access entries again
        _ = service.entries
        
        # Verify loader was NOT called
        mock_loader.assert_not_called()

def test_smart_reload_on_main_change(temp_beancount_files):
    """Verify reload occurs when main file changes and data updates."""
    paths = temp_beancount_files
    service = BeancountService(paths["main"], paths["budget"])
    
    # Initial load
    assert len(service.entries) > 0
    
    # Modify main file
    time.sleep(1.1)
    with open(paths["main"], "a") as f:
        f.write('\n2023-01-03 * "New Main Transaction"\n  Assets:Cash -10 USD\n  Expenses:Food 10 USD\n')
    
    # Access entries
    entries = service.entries
    
    # Verify new data present
    has_new_txn = any(e.narration == "New Main Transaction" for e in entries if hasattr(e, 'narration'))
    assert has_new_txn, "New transaction from main file should be loaded"

def test_smart_reload_on_included_change(temp_beancount_files):
    """Verify reload occurs when an INCLUDED file changes."""
    paths = temp_beancount_files
    service = BeancountService(paths["main"], paths["budget"])
    
    service.load()
    
    # Modify included file
    time.sleep(1.1)
    with open(paths["included"], "a") as f:
        f.write('\n2023-01-04 * "New Included Transaction"\n  Assets:Cash -5 USD\n  Expenses:Food 5 USD\n')
        
    entries = service.entries
    has_new_txn = any(e.narration == "New Included Transaction" for e in entries if hasattr(e, 'narration'))
    assert has_new_txn, "New transaction from included file should be loaded"

def test_no_reload_on_budget_change(temp_beancount_files):
    """Verify reload does NOT occur when the excluded budget file changes."""
    paths = temp_beancount_files
    service = BeancountService(paths["main"], paths["budget"])
    
    service.load()
    
    with patch.object(service, 'loader_func', wraps=service.loader_func) as mock_loader:
        time.sleep(1.1)
        with open(paths["budget"], "a") as f:
            f.write('\n; Budget change that should be ignored\n')
            
        _ = service.entries
        mock_loader.assert_not_called()

def test_write_operation_invalidates_cache(temp_beancount_files):
    """Verify internal write operations force a reload."""
    paths = temp_beancount_files
    service = BeancountService(paths["main"], paths["budget"])
    service.load()
    
    budget = StandardBudget(
        account="Expenses:Food",
        amount=100,
        currency="USD",
        tags=[],
        start_date=date(2023, 1, 1),
        frequency="monthly",
        created_at=int(time.time())
    )
    
    service.add_budget(budget)
    entries = service.entries
    has_budget = any(
        getattr(e, 'type', '') == 'budget' and e.values[0].value == "Expenses:Food" 
        for e in entries
    )
    assert has_budget, "Budget added via add_budget should be visible immediately"

# --- LEGACY TESTS (Preserved) ---

def test_load_valid_string():
    """Verify we can load transactions from an in-memory string."""
    content = """
2024-01-01 open Assets:Checking USD
2024-01-01 * "MyJob" "Opening Balance"
  Assets:Checking  1000.00 USD
  Equity:Opening-Balances
"""
    # ensure_fresh will behave safely because os.path.getmtime raises OSError for string content, 
    # forcing a reload, which calls loader.load_string(content) -> success.
    service = BeancountService(
        content, budget_file="dummy.bean", loader_func=loader.load_string
    )

    txns = service.get_transactions()

    assert len(txns) == 1
    assert txns[0].payee == "MyJob"
    assert txns[0].narration == "Opening Balance"
    assert txns[0].date.strftime("%Y-%m-%d") == "2024-01-01"


def test_empty_string():
    """Verify empty content returns no transactions."""
    service = BeancountService(
        "", budget_file="dummy.bean", loader_func=loader.load_string
    )
    assert len(service.get_transactions()) == 0


def test_lazy_loading(tmp_path):
    """Verify loading happens on access, not init."""
    # Updated to use a real file to avoid ensure_fresh reloading issues with mock loader strings
    
    call_count = 0
    def mock_loader(data):
        nonlocal call_count
        call_count += 1
        return ([], [], {})

    # We'll use real file approach for robustness
    f = tmp_path / "valid.bean"
    f.write_text("")
    service_valid = BeancountService(str(f), budget_file="b.bean", loader_func=mock_loader)
    
    _ = service_valid.entries
    # call_count should be 1
    first_count = call_count
    assert first_count == 1
    
    _ = service_valid.entries
    # call_count should remain same if caching works and mtime hasn't changed
    assert call_count == first_count

def test_get_accounts():
    """Verify we can extract active accounts from Open directives."""
    content = """
2024-01-01 open Assets:Checking USD
2024-01-01 open Expenses:Food USD
2024-01-01 open Income:Salary USD
2024-02-01 close Assets:OldBank
"""
    service = BeancountService(
        content, budget_file="dummy.bean", loader_func=loader.load_string
    )

    accounts = service.get_accounts()

    # We expect 3 open accounts
    assert len(accounts) == 3
    account_names = {a.name for a in accounts}
    assert "Assets:Checking" in account_names
    assert "Expenses:Food" in account_names
    assert "Income:Salary" in account_names
    assert "Assets:OldBank" not in account_names  # Should be ignored (closed)


def test_get_transactions_returns_pydantic():
    """Verify get_transactions returns Pydantic models with Postings."""
    content = """
2024-01-01 * "Store" "Groceries"
  Expenses:Food  10.00 USD
  Assets:Cash   -10.00 USD
"""
    service = BeancountService(
        content, budget_file="dummy.bean", loader_func=loader.load_string
    )

    txns = service.get_transactions()

    assert len(txns) == 1
    t = txns[0]
    assert t.payee == "Store"
    assert len(t.postings) == 2
    p1 = t.postings[0]
    assert p1.account == "Expenses:Food"
    assert str(p1.units) == "10.00"
    assert p1.currency == "USD"


def test_add_budget_writes_to_segregated_file(tmp_path):
    """Verify add_budget writes to the budget file, not the main file."""
    main_file = tmp_path / "main.bean"
    budget_file = tmp_path / "budgets.bean"

    main_file.write_text(
        'include "budgets.bean"\n2024-01-01 open Expenses:Food USD\n', encoding="utf-8"
    )
    budget_file.write_text("", encoding="utf-8")

    service = BeancountService(str(main_file), budget_file=str(budget_file))

    allocation = StandardBudget(
        account="Expenses:Food",
        amount=Decimal("500.00"),
        currency="USD",
        tags=[],
        start_date=date(2025, 1, 1),
        frequency="monthly",
    )

    service.add_budget(allocation)

    budget_content = budget_file.read_text(encoding="utf-8")
    assert 'custom "budget" Expenses:Food' in budget_content
    assert "500.0" in budget_content

    main_content = main_file.read_text(encoding="utf-8")
    assert 'custom "budget"' not in main_content
    
    # Reload transparently
    service_load = BeancountService(str(main_file), budget_file=str(budget_file))
    entries = service_load.entries
    budget_entries = [e for e in entries if hasattr(e, "type") and e.type == "budget"]
    assert len(budget_entries) == 1
    assert budget_entries[0].values[0].value == "Expenses:Food"


def test_check_budget_include(tmp_path):
    """Verify check_budget_include logic for relative paths."""
    # Scenario 1: Include exists (Same Dir)
    main_file = tmp_path / "main.bean"
    budget_file = tmp_path / "budgets.bean"

    main_file.write_text('include "budgets.bean"\n', encoding="utf-8")

    service = BeancountService(str(main_file), budget_file=str(budget_file))
    assert service.check_budget_include() is True

    # Scenario 2: Include missing
    main_file.write_text('option "title" "No Include"\n', encoding="utf-8")
    assert service.check_budget_include() is False

    # Scenario 3: Include exists (Sub Dir)
    # Re-setup
    subdir = tmp_path / "sub"
    subdir.mkdir()
    sub_budget = subdir / "sub_budgets.bean"

    # Main file should have include "sub/sub_budgets.bean"
    main_file.write_text('include "sub/sub_budgets.bean"\n', encoding="utf-8")

    service_sub = BeancountService(str(main_file), budget_file=str(sub_budget))
    assert service_sub.check_budget_include() is True

    # Scenario 4: Main file missing
    missing_service = BeancountService(
        str(tmp_path / "missing.bean"), budget_file="dummy"
    )
    assert missing_service.check_budget_include() is False
