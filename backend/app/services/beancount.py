from beancount import loader
from beancount.core.data import Transaction as BeanTransaction, Open, Close
from app.core.config import settings
from datetime import date
from typing import Any
from collections.abc import Callable
from app.models.domain import Account, Transaction, Posting, BudgetAllocation

class BeancountService:
    def __init__(self, filepath: str, loader_func: Callable = loader.load_file):
        self.filepath = filepath
        self.loader_func = loader_func
        self._entries = []
        self._errors = []
        self._options = {}
        self._loaded = False

    def load(self) -> None:
        """Loads and parses the beancount file."""
        # If loader is load_string, filepath plays a different role or is ignored, 
        # but standard beancount usage is load_file(path) or load_string(content)
        # We will adapt based on the callable signature if needed, but for now assume compatible
        self._entries, self._errors, self._options = self.loader_func(self.filepath)
        self._loaded = True

    @property
    def entries(self) -> list[Any]:
        if not self._loaded:
             self.load()
        return self._entries

    def get_transactions(self, start_date: date | None = None, end_date: date | None = None) -> list[Transaction]:
        txns = []
        for entry in self.entries:
            if isinstance(entry, BeanTransaction):
                # Apply Date Filtering
                if start_date and entry.date < start_date:
                    continue
                if end_date and entry.date > end_date:
                    continue

                postings = []
                for p in entry.postings:
                    # Posting units is an Amount(number, currency)
                    postings.append(Posting(
                        account=p.account,
                        units=p.units.number,
                        currency=p.units.currency
                    ))
                
                txns.append(Transaction(
                    date=entry.date,
                    payee=entry.payee,
                    narration=entry.narration,
                    flag=entry.flag,
                    postings=postings
                ))
        return txns

    def get_accounts(self) -> list[Account]:
        """
        Returns a list of all active accounts.
        An account is active if it has an Open directive and no Close directive (or closed later).
        For simplicity in this V1, we just check if it's ever opened and not currently closed.
        """
        open_accounts = {} # name -> Open directive
        closed_accounts = set()
        
        for entry in self.entries:
            if isinstance(entry, Open):
                open_accounts[entry.account] = entry
            elif isinstance(entry, Close):
                closed_accounts.add(entry.account)
        
        accounts = []
        for name, open_directive in open_accounts.items():
            if name not in closed_accounts:
                # Simple extraction of type (Assets, Expenses, etc)
                account_type = name.split(":")[0]
                # Default currency from the open directive if available, else USD
                currency = open_directive.currencies[0] if open_directive.currencies else "USD"
                
                accounts.append(Account(
                    name=name,
                    type=account_type,
                    currency=currency
                ))
        return accounts

    def add_budget(self, allocation: BudgetAllocation) -> None:
        """
        Appends a budget directive to the beancount file.
        Format: YYYY-MM-DD custom "budget" Account Amount Currency
        """
        # Ensure period is YYYY-MM-DD. 
        # If we passed "2024-01", we might want to default to 01, but for now assume full date.
        
        directive = f'{allocation.period} custom "budget" {allocation.account} {allocation.amount} {allocation.currency}\n'
        
        with open(self.filepath, "a") as f:
            f.write(directive)
        
        # Invalidate cache so next read sees it (though read usually re-reads file in beancount)
        self._loaded = False


# Dependency for FastAPI
def get_beancount_service():
    return BeancountService(settings.beancount_file)
