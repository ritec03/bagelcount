import pytest
from beancount import loader
from app.services.beancount import BeancountService

def test_load_valid_string():
    """Verify we can load transactions from an in-memory string."""
    content = """
2024-01-01 open Assets:Checking USD
2024-01-01 * "MyJob" "Opening Balance"
  Assets:Checking  1000.00 USD
  Equity:Opening-Balances
"""
    # We inject loader.load_string instead of load_file
    service = BeancountService(content, loader_func=loader.load_string)
    
    # Act
    txns = service.get_transactions()
    
    # Assert
    assert len(txns) == 1
    assert txns[0].payee == "MyJob"
    assert txns[0].narration == "Opening Balance"
    assert txns[0].date.strftime("%Y-%m-%d") == "2024-01-01"

def test_empty_string():
    """Verify empty content returns no transactions."""
    service = BeancountService("", loader_func=loader.load_string)
    assert len(service.get_transactions()) == 0

def test_lazy_loading():
    """Verify loading happens on access, not init."""
    # We use a mock loader to verify call count
    call_count = 0
    def mock_loader(data):
        nonlocal call_count
        call_count += 1
        return ([], [], {})
        
    service = BeancountService("dummy", loader_func=mock_loader)
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
    service = BeancountService(content, loader_func=loader.load_string)
    
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
    service = BeancountService(content, loader_func=loader.load_string)
    
    txns = service.get_transactions()
    
    # Verify top level
    assert len(txns) == 1
    t = txns[0]
    # Check it's our Pydantic model (by checking a method or type, or just attr access)
    assert t.payee == "Store"
    assert len(t.postings) == 2
    
    # Check postings
    p1 = t.postings[0]
    assert p1.account == "Expenses:Food"
    assert str(p1.units) == "10.00"
    assert p1.currency == "USD"

from app.models.domain import BudgetAllocation
from decimal import Decimal

def test_add_budget_appends_to_file(tmp_path):
    """Verify add_budget appends a correctly formatted directive to the file."""
    # Setup temp file
    bean_file = tmp_path / "main.bean"
    bean_file.write_text('2024-01-01 open Expenses:Food USD\n')
    
    service = BeancountService(str(bean_file))
    
    allocation = BudgetAllocation(
        account="Expenses:Food",
        amount=Decimal("500.00"),
        currency="USD",
        period="2025-01-01" # Using YYYY-MM-DD for consistency with date type, or string YYYY-MM
    )
    
    # Act
    service.add_budget(allocation)
    
    # Assert
    content = bean_file.read_text()
    expected_line = '2025-01-01 custom "budget" Expenses:Food 500.00 USD'
    assert expected_line in content
    # Ensure it didn't overwrite
    assert "open Expenses:Food USD" in content
