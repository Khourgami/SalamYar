"""`GET /agents` (API_CONTRACT §4)."""

from fastapi import APIRouter, Depends

from app.agents.registry import Registry, get_registry
from app.auth.deps import current_user
from app.db.models import User
from app.schemas.api import AgentPublic
from app.services.session_service import list_agents

router = APIRouter(tags=["agents"])


@router.get("/agents", response_model=list[AgentPublic])
def get_agents(
    user: User = Depends(current_user), registry: Registry = Depends(get_registry)
) -> list[AgentPublic]:
    return list_agents(registry, user)
