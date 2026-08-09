from fastapi import APIRouter

from app.core.config import get_settings

router = APIRouter(tags=["meta"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "environment": get_settings().environment}
