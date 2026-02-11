
import pytest
from beancount import loader
from app.services.beancount import BeancountService
from app.models.domain import StandardBudget
from decimal import Decimal
from datetime import date

def test_load_valid_string():
    """Verify we can load transactions from an in-memory string."""
    content = """
2024-01-01 open Assets:Checking USD
2024-01-01 * "MyJob" "Opening Balance"
  Assets:Checking  1000.00 USD
  Equity:Opening-Balances
"""
    # We inject loader.load_string instead of load_file
    service = BeancountService(content, budget_file="dummy.bean", loader_func=loader.load_string)
    
    # Act
    txns = service.get_transactions()
    
    # Assert
    assert len(txns) == 1
    assert txns[0].payee == "MyJob"
    assert txns[0].narration == "Opening Balance"
    assert txns[0].date.strftime("%Y-%m-%d") == "2024-01-01"

def test_empty_string():
    """Verify empty content returns no transactions."""
    service = BeancountService("", budget_file="dummy.bean", loader_func=loader.load_string)
    assert len(service.get_transactions()) == 0

def test_lazy_loading():
    """Verify loading happens on access, not init."""
    # We use a mock loader to verify call count
    call_count = 0
    def mock_loader(data):
        nonlocal call_count
        call_count += 1
        return ([], [], {})
        
    service = BeancountService("dummy", budget_file="dummy.bean", loader_func=mock_loader)
    assert call_count == 0
    
    _ = service.entries
    assert call_count == 1
    
    _ = service.entries
    assert call_count == 1  # Should be cached

def test_get_accounts():
    """Verify we can extract active accounts from Open directives."""
    content = """
2024-01-01 open Assets:Checking USD
2024-01-01 open Expenses:Food USD
2024-01-01 open Income:Salary USD
2024-02-01 close Assets:OldBank
"""
    service = BeancountService(content, budget_file="dummy.bean", loader_func=loader.load_string)
    
    accounts = service.get_accounts()
    
    # We expect 3 open accounts
    assert len(accounts) == 3
    account_names = {a.name for a in accounts}
    assert "Assets:Checking" in account_names
    assert "Expenses:Food" in account_names
    assert "Income:Salary" in account_names
    assert "Assets:OldBank" not in account_names # Should be ignored (closed)

def test_get_transactions_returns_pydantic():
    """Verify get_transactions returns Pydantic models with Postings."""
    content = """
2024-01-01 * "Store" "Groceries"
  Expenses:Food  10.00 USD
  Assets:Cash   -10.00 USD
"""
    service = BeancountService(content, budget_file="dummy.bean", loader_func=loader.load_string)
    
    txns = service.get_transactions()
    
    # Verify top level
    assert len(txns) == 1
    t = txns[0]
    # Check it's our Pydantic model
    assert t.payee == "Store"
    assert len(t.postings) == 2
    
    # Check postings
    p1 = t.postings[0]
    assert p1.account == "Expenses:Food"
    assert str(p1.units) == "10.00"
    assert p1.currency == "USD"

def test_add_budget_writes_to_segregated_file(tmp_path):
    """Verify add_budget writes to the budget file, not the main file."""
    # Setup temp files
    main_file = tmp_path / "main.bean"
    budget_file = tmp_path / "budgets.bean"
    
    # Beancount files must be valid UTF-8
    main_file.write_text('include "budgets.bean"\n2024-01-01 open Expenses:Food USD\n', encoding="utf-8")
    budget_file.write_text("", encoding="utf-8")
    
    service = BeancountService(str(main_file), budget_file=str(budget_file))
    
    allocation = StandardBudget(
        account="Expenses:Food",
        amount=Decimal("500.00"),
        currency="USD",
        start_date=date(2025, 1, 1),
        frequency="monthly"
    )
    
    # Act
    service.add_budget(allocation)
    
    # Assert - Check Budget File
    budget_content = budget_file.read_text(encoding="utf-8")
    today_str = date.today().isoformat()
    
    # Check for custom directive in budget file
    assert f'{today_str} custom "budget" Expenses:Food' in budget_content
    # Depending on float/decimal quantization, check roughly
    assert '500.0' in budget_content
    assert 'USD' in budget_content
    
    # Metadata checks
    assert 'start_date: "2025-01-01"' in budget_content
    assert 'frequency: "monthly"' in budget_content
    
    # Assert - Check Main File
    main_content = main_file.read_text(encoding="utf-8")
    assert 'custom "budget"' not in main_content
    
    # Verify Transparency (Load via Main)
    # Re-instantiate service to trigger load (or call internal load)
    # BeancountService(..., loader_func=loader.load_file) uses real filesystem
    service_load = BeancountService(str(main_file), budget_file=str(budget_file))
    txns = service_load.entries
    
    # Filter for budget directives
    budget_entries = [e for e in txns if hasattr(e, 'type') and e.type == 'budget']
    assert len(budget_entries) == 1
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
    missing_service = BeancountService(str(tmp_path / "missing.bean"), budget_file="dummy")
    assert missing_service.check_budget_include() is False
