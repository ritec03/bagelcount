
import pytest
from datetime import date
from decimal import Decimal
from app.services.beancount import BeancountService
from app.models.domain import StandardBudget, CustomBudget
from beancount import loader

def test_resolve_standard_budget_conflict():
    """Verify that among conflicting Standard budgets, the one with higher created_at wins."""
    content = """
2024-01-01 custom "budget" Expenses:Food 500.00 USD
  start_date: "2024-01-01"
  frequency: "monthly"
  created_at: "100"

2024-01-01 custom "budget" Expenses:Food 600.00 USD
  start_date: "2024-01-01"
  frequency: "monthly"
  created_at: "200"

2024-01-01 custom "budget" Expenses:Food 400.00 USD
  start_date: "2024-01-01"
  frequency: "monthly"
  created_at: "50"
"""
    service = BeancountService(content, budget_file="dummy.bean", loader_func=loader.load_string)
    budgets = service.get_active_budgets()
    
    # Should resolve to exactly 1 budget for this key
    assert len(budgets) == 1
    winner = budgets[0]
    
    assert isinstance(winner, StandardBudget)
    assert winner.amount == Decimal("600.00")
    assert winner.created_at == 200

def test_resolve_different_tags_no_conflict():
    """Verify that identical budgets with different tags are NOT conflicts (Parallel Dimensions)."""
    content = """
2024-01-01 custom "budget" Expenses:Food 500.00 USD
  start_date: "2024-01-01"
  frequency: "monthly"
  created_at: "100"
  tags: "project-a"

2024-01-01 custom "budget" Expenses:Food 600.00 USD
  start_date: "2024-01-01"
  frequency: "monthly"
  created_at: "200"
  tags: "project-b"
"""
    service = BeancountService(content, budget_file="dummy.bean", loader_func=loader.load_string)
    budgets = service.get_active_budgets()
    
    assert len(budgets) == 2
    amounts = {b.amount for b in budgets}
    assert Decimal("500.00") in amounts
    assert Decimal("600.00") in amounts

def test_resolve_tag_order_normalization():
    """Verify that tag order doesn't matter for conflict key."""
    content = """
2024-01-01 custom "budget" Expenses:Food 500.00 USD
  start_date: "2024-01-01"
  frequency: "monthly"
  created_at: "100"
  tags: "a,b"

2024-01-01 custom "budget" Expenses:Food 600.00 USD
  start_date: "2024-01-01"
  frequency: "monthly"
  created_at: "200"
  tags: "b,a"
"""
    service = BeancountService(content, budget_file="dummy.bean", loader_func=loader.load_string)
    budgets = service.get_active_budgets()
    
    # Should resolve to 1 because tags are effectively same set
    assert len(budgets) == 1
    assert budgets[0].amount == Decimal("600.00")

def test_standard_vs_custom_coexistence():
    """Verify Standard and Custom budgets for same account coexist (Dimension A vs B)."""
    content = """
2024-01-01 custom "budget" Expenses:Food 500.00 USD
  start_date: "2024-01-01"
  frequency: "monthly"
  created_at: "100"

2024-01-01 custom "budget" Expenses:Food 1000.00 USD
  start_date: "2024-01-15"
  end_date: "2024-01-20"
  created_at: "200"
"""
    service = BeancountService(content, budget_file="dummy.bean", loader_func=loader.load_string)
    budgets = service.get_active_budgets()
    
    assert len(budgets) == 2
    types = {type(b) for b in budgets}
    assert StandardBudget in types
    assert CustomBudget in types

def test_malformed_metadata_ignored():
    """Verify directives with missing required metadata are ignored safely."""
    content = """
2024-01-01 custom "budget" Expenses:Food 500.00 USD
  somedata: "check"
"""
    service = BeancountService(content, budget_file="dummy.bean", loader_func=loader.load_string)
    budgets = service.get_active_budgets()
    
    assert len(budgets) == 0

def test_missing_created_at_defaults_low():
    """Verify missing created_at is treated as 0 (loses to explicit timestamp)."""
    content = """
2024-01-01 custom "budget" Expenses:Food 500.00 USD
  start_date: "2024-01-01"
  frequency: "monthly"
  # No created_at

2024-01-01 custom "budget" Expenses:Food 600.00 USD
  start_date: "2024-01-01"
  frequency: "monthly"
  created_at: "10"
"""
    service = BeancountService(content, budget_file="dummy.bean", loader_func=loader.load_string)
    budgets = service.get_active_budgets()
    
    assert len(budgets) == 1
    assert budgets[0].amount == Decimal("600.00")

def test_ambiguous_metadata_priority():
    """Verify that if both frequency and end_date exist, frequency takes priority (StandardBudget)."""
    content = """
2024-01-01 custom "budget" Expenses:Food 500.00 USD
  start_date: "2024-01-01"
  frequency: "monthly"
  end_date: "2024-01-31" 
"""
    # Our logic `if "frequency" ... elif "end_date"` implies frequency wins.
    service = BeancountService(content, budget_file="dummy.bean", loader_func=loader.load_string)
    budgets = service.get_active_budgets()
    
    assert len(budgets) == 1
    assert isinstance(budgets[0], StandardBudget)
    assert budgets[0].frequency == "monthly"

def test_invalid_date_format_in_metadata_is_skipped():
    """Verify directives with unparseable dates in metadata are skipped."""
    content = """
2024-01-01 custom "budget" Expenses:Food 500.00 USD
  start_date: "not-a-date"
  frequency: "monthly"
"""
    service = BeancountService(content, budget_file="dummy.bean", loader_func=loader.load_string)
    budgets = service.get_active_budgets()
    
    assert len(budgets) == 0

def test_whitespace_tags_normalization():
    """Verify tags with extra whitespace are cleaned up."""
    content = """
2024-01-01 custom "budget" Expenses:Food 500.00 USD
  start_date: "2024-01-01"
  frequency: "monthly"
  tags: " a ,  b  "
"""
    service = BeancountService(content, budget_file="dummy.bean", loader_func=loader.load_string)
    budgets = service.get_active_budgets()
    
    assert len(budgets) == 1
    assert "a" in budgets[0].tags
    assert "b" in budgets[0].tags
    assert " a " not in budgets[0].tags
