from fastapi import APIRouter

from app.api import admin, agents, auth, evaluations, sessions

router = APIRouter()
router.include_router(auth.router)
router.include_router(agents.router)
router.include_router(sessions.router)
router.include_router(evaluations.router)
router.include_router(admin.router)
