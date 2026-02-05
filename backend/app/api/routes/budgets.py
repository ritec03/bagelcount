from fastapi import APIRouter, Depends
from app.services.beancount import BeancountService, get_beancount_service
from app.models.domain import BudgetAllocation
from datetime import date

router = APIRouter()

@router.post("/", response_model=dict)
def create_budget(
    allocation: BudgetAllocation,
    service: BeancountService = Depends(get_beancount_service)
):
    """
    Appends a new budget directive.
    Accepts StandardBudget (frequency) or CustomBudget (end_date).
    """
    service.add_budget(allocation)
    return {"status": "ok"}

@router.get("/", response_model=list[BudgetAllocation])
def get_budgets(
    date: date | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    service: BeancountService = Depends(get_beancount_service)
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
