from fastapi import APIRouter, Depends, Query
from app.services.beancount import BeancountService, get_beancount_service
from app.models.domain import Transaction
from datetime import date

router = APIRouter()

@router.get("/", response_model=list[Transaction])
def get_transactions(
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    service: BeancountService = Depends(get_beancount_service)
):
    """
    Returns a list of transactions.
    Optional filtering by date range [from_date, to_date].

    Default Behavior: Returns all transactions when no dates are provided.
    From Date: Returns transactions on or after the specified date.
    To Date: Returns transactions on or before the specified date.
    Date Range: Returns transactions within the specified range (inclusive).
    Empty Range: Returns no transactions if the range excludes all data.
    """
    return service.get_transactions(start_date=from_date, end_date=to_date)
