from pydantic import BaseModel
from typing import List, Optional
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
    payee: Optional[str] = None
    narration: str
    flag: Optional[str] = "*"
    postings: List[Posting] = []

class BudgetAllocation(BaseModel):
    account: str
    amount: Decimal
    currency: str = "USD"
    period: str # e.g. "2024-01"
