from pydantic import BaseModel
from typing import Literal
from datetime import date
from decimal import Decimal

class Account(BaseModel):
    name: str
    type: str # e.g. "Assets", "Expenses"
    currency: str = "USD"
    # We can add more fields later like active status, close date, etc.

class Posting(BaseModel):
    account: str
    units: Decimal
    currency: str

class Transaction(BaseModel):
    date: date
    payee: str | None = None
    narration: str
    flag: str | None = "*"
    postings: list[Posting] = []

class BaseBudget(BaseModel):
    account: str
    amount: Decimal
    currency: str = "CAD" # TODO remove default value here
    tags: list[str] = []
    created_at: int | None = None
    start_date: date

class StandardBudget(BaseBudget):
    frequency: Literal["monthly", "quarterly", "yearly"]

class CustomBudget(BaseBudget):
    end_date: date

BudgetAllocation = StandardBudget | CustomBudget
