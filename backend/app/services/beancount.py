from beancount import loader
from beancount.core.data import Transaction as BeanTransaction, Open, Close
from app.core.config import settings
from datetime import date
from typing import Any
from collections.abc import Callable
from app.models.domain import Account, Transaction, Posting, BudgetAllocation, StandardBudget, CustomBudget

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
        Metadata: start_date, end_date (opt), frequency (opt), tags, created_at
        """
        import time
        
        # Ensure created_at is set
        if allocation.created_at is None:
            allocation.created_at = int(time.time())
            
        # Base metadata
        meta = {
            "start_date": allocation.start_date.isoformat(),
            "created_at": str(allocation.created_at)
        }
        
        # Type-specific metadata
        if isinstance(allocation, StandardBudget):
            meta["frequency"] = allocation.frequency
        elif isinstance(allocation, CustomBudget):
            meta["end_date"] = allocation.end_date.isoformat()
            
        # Tags handling in metadata? 
        # Usually tags are appended to the directive line like #tag1 #tag2, 
        # OR stored in metadata. usage: custom "budget" Acct Amt Curr #tag1
        # Let's put them in metadata for cleaner separation as per plan, 
        # unless beancount native tags are preferred. Plan said "metadata".
        if allocation.tags:
            meta["tags"] = ",".join(allocation.tags)

        # Construct directive
        # 2024-01-01 custom "budget" Expenses:Food 500.00 USD
        
        # We use start_date as the directive date (Date-Matched logic) OR 
        # do we use Today? 
        # Plan says: "We use the Directive Date as the 'Created At' timestamp."
        # Wait, plan said: "Recommendation: Date-Matched Last-One-Wins... We use the Directive Date as the 'Created At' timestamp."
        # Actually in Round 2: 
        # "We use the Directive Date as the 'Created At' timestamp."
        # BUT we also added `created_at` integer metadata for precision.
        # So directive date = today (creation date).
        
        directive_date = date.today().isoformat()
        
        # Format metadata block
        #   key: "value"
        meta_lines = []
        for k, v in meta.items():
            meta_lines.append(f'  {k}: "{v}"')
            
        directive = f'{directive_date} custom "budget" {allocation.account} {allocation.amount} {allocation.currency}\n'
        if meta_lines:
            directive += "\n".join(meta_lines) + "\n"
        
        with open(self.filepath, "a") as f:
            f.write("\n" + directive)
        
        self._loaded = False


    def get_active_budgets(self, start_date: date | None = None, end_date: date | None = None) -> list[BudgetAllocation]:
        """
        Parses all 'custom "budget"' directives and returns the active resolved budgets 
        that overlap with the given date range.
        If dates are None, returns all currently active budgets (assuming today).
        """
        active_candidates = {} # Key -> List[BudgetAllocation]
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
                        frequency=meta["frequency"]
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
                        end_date=b_end
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
            winner = sorted(candidates, key=lambda x: x.created_at or 0, reverse=True)[0]
            resolved_budgets.append(winner)
            
        return resolved_budgets
# Dependency for FastAPI
def get_beancount_service():
    return BeancountService(settings.beancount_file)
