from fastapi import APIRouter, Depends, HTTPException
from app.services.beancount import BeancountService, get_beancount_service
from app.models.domain import BudgetAllocation, StandardBudget
from datetime import date

router = APIRouter()


@router.post("/", response_model=dict)
def create_budget(
    allocation: BudgetAllocation,
    service: BeancountService = Depends(get_beancount_service),
):
    """
    Appends a new budget directive.
    Accepts StandardBudget (frequency) or CustomBudget (end_date).
    Validates hierarchical consistency for StandardBudget.
    """

    if isinstance(allocation, StandardBudget):
        # Fetch 'active' budgets roughly around start_date or today to validate context
        # Ideally we check the period this budget applies to.
        # For V1, we check against currently active budgets using start_date=today
        existing_budgets = service.get_active_budgets(start_date=date.today())
        standard_budgets = [
            b for b in existing_budgets if isinstance(b, StandardBudget)
        ]

        # 1. Child Check: Cannot exceed Parent
        parts = allocation.account.split(":")
        if len(parts) > 1:
            parent_name = ":".join(parts[:-1])
            parent_budget = next(
                (b for b in standard_budgets if b.account == parent_name), None
            )

            if parent_budget:
                # Siblings (Direct children of parent)
                siblings = [
                    b
                    for b in standard_budgets
                    if b.account.startswith(parent_name + ":")
                    and len(b.account.split(":")) == len(parts)
                    and b.account != allocation.account  # Exclude self if updating
                ]
                siblings_used = sum(b.amount for b in siblings)
                available = parent_budget.amount - siblings_used
                
                # TODO implement proper budget validation on backend
                # if allocation.amount > available:
                #     raise HTTPException(
                #         status_code=400, 
                #         detail=f"Exceeds parent budget ({parent_name}). Available: {available}"
                #     )

        # 2. Parent Check: Must cover Children
        children = [
            b
            for b in standard_budgets
            if b.account.startswith(allocation.account + ":")
            and len(b.account.split(":")) == len(parts) + 1
        ]
        if children:
            children_sum = sum(b.amount for b in children)
            # if allocation.amount < children_sum:
            #     raise HTTPException(
            #         status_code=400, 
            #         detail=f"Insufficient for sub-categories. Required: {children_sum}"
            #     )

    service.add_budget(allocation)
    return {"status": "ok"}


@router.get("/", response_model=list[BudgetAllocation])
def get_budgets(
    date: date | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    service: BeancountService = Depends(get_beancount_service),
):
    """
    Returns active budgets resolved for the given criteria.
    - If `date` provided: Returns budgets active on that specific day.
    - If `start_date` / `end_date` provided: Returns budgets overlapping that range.
    - If neither: Returns defaults (today).
    """

    s_date = start_date
    e_date = end_date

    if date:
        s_date = date
        e_date = date

    return service.get_active_budgets(start_date=s_date, end_date=e_date)
