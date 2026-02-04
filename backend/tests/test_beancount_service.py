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
