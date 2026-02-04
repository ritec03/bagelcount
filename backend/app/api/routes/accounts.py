from fastapi import APIRouter, Depends
from app.services.beancount import BeancountService, get_beancount_service
from typing import List
from app.models.domain import Account

router = APIRouter()

@router.get("/", response_model=List[Account])
def get_accounts(
    service: BeancountService = Depends(get_beancount_service)
):
    """
    Returns a list of all active accounts.
    """
    return service.get_accounts()
