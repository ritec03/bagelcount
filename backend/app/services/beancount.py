from beancount import loader
from beancount.core.data import Open, Close
from app.core.config import settings
from datetime import date
from typing import Any
from collections.abc import Callable
from app.models.domain import (
    Account,
    Transaction as DomainTransaction,
    Posting,
    BudgetAllocation,
    StandardBudget,
    CustomBudget,
)
from beancount.core.data import Transaction, Amount, Custom
from beancount.core import account
from beancount.parser import printer
import os
import time
from decimal import Decimal


class BeancountService:
    def __init__(
        self, filepath: str, budget_file: str, loader_func: Callable = loader.load_file
    ):
        self.filepath = filepath
        self.budget_file = budget_file
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

    def get_transactions(
        self, start_date: date | None = None, end_date: date | None = None
    ) -> list[DomainTransaction]:
        txns = []
        for entry in self.entries:
            if isinstance(entry, Transaction):
                # Apply Date Filtering
                if start_date and entry.date < start_date:
                    continue
                if end_date and entry.date > end_date:
                    continue

                postings = []
                for p in entry.postings:
                    # Posting units is an Amount(number, currency)
                    postings.append(
                        Posting(
                            account=p.account,
                            units=p.units.number,
                            currency=p.units.currency,
                        )
                    )

                txns.append(
                    DomainTransaction(
                        date=entry.date,
                        payee=entry.payee,
                        narration=entry.narration,
                        flag=entry.flag,
                        postings=postings,
                    )
                )
        return txns

    def get_accounts(self) -> list[Account]:
        """
        Returns a list of all active accounts.
        An account is active if it has an Open directive and no Close directive (or closed later).
        For simplicity in this V1, we just check if it's ever opened and not currently closed.
        """
        open_accounts = {}  # name -> Open directive
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
                currency = (
                    open_directive.currencies[0] if open_directive.currencies else "USD"
                )

                accounts.append(
                    Account(name=name, type=account_type, currency=currency)
                )
        return accounts

    def add_budget(self, allocation: BudgetAllocation) -> None:
        """
        Appends a budget directive to the budget file using Beancount printer.
        Format: YYYY-MM-DD custom "budget" Account Amount Currency
        Metadata: start_date, end_date (opt), frequency (opt), tags, created_at
        """

        # Ensure created_at is set
        if allocation.created_at is None:
            allocation.created_at = int(time.time())

        # Base metadata
        meta = {
            "start_date": allocation.start_date.isoformat(),
            "created_at": str(allocation.created_at),
        }

        # Type-specific metadata
        if isinstance(allocation, StandardBudget):
            meta["frequency"] = allocation.frequency
        elif isinstance(allocation, CustomBudget):
            meta["end_date"] = allocation.end_date.isoformat()

        if allocation.tags:
            meta["tags"] = ",".join(allocation.tags)

        # Construct directive using Native Objects

        directive_date = date.today()

        # Convert amount to Decimal for Amount
        amount_decimal = Decimal(str(allocation.amount))
        amount_obj = Amount(amount_decimal, allocation.currency)

        # Values: Account (String), Amount (Amount)
        # Printer expects values to be tuples of (value, dtype)
        values = [(allocation.account, account.TYPE), (amount_obj, Amount)]

        entry = Custom(meta=meta, date=directive_date, type="budget", values=values)

        # Generate string
        entry_string = printer.format_entry(entry)

        # Ensure directory exists
        os.makedirs(os.path.dirname(self.budget_file) or ".", exist_ok=True)

        # Write to separate budget file
        with open(self.budget_file, "a") as f:
            f.write("\n" + entry_string)

        self._loaded = False

    def get_active_budgets(
        self, start_date: date | None = None, end_date: date | None = None
    ) -> list[BudgetAllocation]:
        """
        Parses all 'custom "budget"' directives and returns the active resolved budgets
        that overlap with the given date range.
        If dates are None, returns all currently active budgets (assuming today).
        """
        active_candidates = {}  # Key -> List[BudgetAllocation]
        from beancount.core.data import Custom

        for entry in self.entries:
            if not (isinstance(entry, Custom) and entry.type == "budget"):
                continue

            try:
                meta = entry.meta
                # Validate required metadata presence before parsing
                if "start_date" not in meta:
                    continue

                account = entry.values[0].value
                amount_obj = entry.values[1].value
                amount = amount_obj.number
                currency = amount_obj.currency

                tags = [t.strip() for t in meta.get("tags", "").split(",") if t.strip()]
                b_start = date.fromisoformat(meta["start_date"])
                b_created = int(meta.get("created_at", 0))

                if "frequency" in meta:
                    budget_obj = StandardBudget(
                        account=account,
                        amount=amount,
                        currency=currency,
                        tags=tags,
                        created_at=b_created,
                        start_date=b_start,
                        frequency=meta["frequency"],
                    )
                    key = (account, b_start, meta["frequency"], tuple(sorted(tags)))
                elif "end_date" in meta:
                    b_end = date.fromisoformat(meta["end_date"])
                    budget_obj = CustomBudget(
                        account=account,
                        amount=amount,
                        currency=currency,
                        tags=tags,
                        created_at=b_created,
                        start_date=b_start,
                        end_date=b_end,
                    )
                    key = (account, b_start, b_end, tuple(sorted(tags)))
                else:
                    continue

                if key not in active_candidates:
                    active_candidates[key] = []
                active_candidates[key].append(budget_obj)

            except (KeyError, ValueError, IndexError, AttributeError):
                continue

        resolved_budgets = []
        for candidates in active_candidates.values():
            winner = sorted(candidates, key=lambda x: x.created_at or 0, reverse=True)[
                0
            ]
            resolved_budgets.append(winner)

        return resolved_budgets

    def check_budget_include(self) -> bool:
        """
        Checks if the main ledger file contains an include directive for the budget file.
        Returns True if the include directive is present, False otherwise.
        """
        if not os.path.exists(self.filepath):
            return False

        # Calculate expected relative path
        main_dir = os.path.dirname(self.filepath) or "."
        try:
            rel_path = os.path.relpath(self.budget_file, main_dir)
        except ValueError:
            # Paths might be on different drives or incompatible
            return False

        # Beancount include directive: include "path/to/file.bean"
        expected_directive = f'include "{rel_path}"'

        try:
            with open(self.filepath, "r", encoding="utf-8") as f:
                content = f.read()
                return expected_directive in content
        except Exception:
            return False


# Dependency for FastAPI
def get_beancount_service():
    return BeancountService(settings.beancount_file, settings.budget_file)
