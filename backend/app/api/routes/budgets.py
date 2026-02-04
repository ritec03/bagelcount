from fastapi import APIRouter, Depends
from app.services.beancount import BeancountService, get_beancount_service
from app.models.domain import BudgetAllocation

router = APIRouter()

@router.post("/")
def create_budget(
    allocation: BudgetAllocation,
    service: BeancountService = Depends(get_beancount_service)
):
    """
    Appends a new budget directive.
    """
    service.add_budget(allocation)
    return {"status": "ok"}
