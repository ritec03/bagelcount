from fastapi import APIRouter, Depends
from app.services.beancount import BeancountService, get_beancount_service
from typing import List

router = APIRouter()

@router.get("/")
def get_transactions(
    service: BeancountService = Depends(get_beancount_service)
):
    """
    Returns a raw list of transactions.
    TODO: Add Pydantic models for response serialization.
    """
    # Force reload for dev? Or rely on service caching?
    # For now, let's allow the service to decide via its accessors
    txns = service.get_transactions()
    
    # Simple serialization for testing
    return [
        {
            "date": t.date,
            "narration": t.narration,
            "payee": t.payee,
            "flag": t.flag,
        }
        for t in txns[:50] # Limit to 50 for now
    ]
