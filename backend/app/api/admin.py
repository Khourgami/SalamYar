"""Admin endpoints (API_CONTRACT §7). All require role `admin`."""

from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.agents.registry import Registry, RegistryError, get_registry
from app.auth.deps import require_admin
from app.db import get_db
from app.db.models import User
from app.errors import not_found, validation_error
from app.schemas.api import AdminSessionList, AdminSessionSummary, ReloadResponse, SessionDetail
from app.schemas.common import UserOut
from app.services import session_service as svc
from app.services.export_service import EXPORT_TABLES, export_csv
from app.services.metrics_service import GroupBy, MetricsResponse, compute_metrics

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/sessions", response_model=AdminSessionList)
def admin_sessions(
    agent_id: str | None = None,
    user_id: str | None = None,
    status: Literal["active", "completed"] | None = None,
    evaluated: bool | None = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AdminSessionList:
    rows, total = svc.list_sessions(
        db,
        user_id=user_id,
        agent_id=agent_id,
        status=status,
        evaluated=evaluated,
        limit=limit,
        offset=offset,
    )
    items = [
        AdminSessionSummary(
            **svc.build_summary(db, s).model_dump(),
            user=UserOut.model_validate(db.get(User, s.user_id)),
            agent_reveal=svc.agent_reveal(s),
        )
        for s in rows
    ]
    return AdminSessionList(items=items, total=total)


@router.get("/sessions/{session_id}", response_model=SessionDetail)
def admin_session(
    session_id: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)
) -> SessionDetail:
    return svc.build_detail(db, svc.load_session(db, session_id), admin, admin_view=True)


@router.get("/metrics", response_model=MetricsResponse)
def metrics(
    group_by: GroupBy = "agent",
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> MetricsResponse:
    return compute_metrics(db, group_by)


@router.get("/export/{table}.csv")
def export(table: str, _: User = Depends(require_admin), db: Session = Depends(get_db)) -> Response:
    if table not in EXPORT_TABLES:
        raise not_found(f"Unknown export table '{table}'")
    return Response(
        content=export_csv(db, table),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{table}.csv"'},
    )


@router.post("/agents/reload", response_model=ReloadResponse)
def reload_agents(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
    registry: Registry = Depends(get_registry),
) -> ReloadResponse:
    try:
        registry.reload()
    except RegistryError as exc:
        raise validation_error(
            f"Invalid agents config; previous config kept. {exc}"[:2000]
        ) from exc
    registry.sync_to_db(db)
    return ReloadResponse(loaded=len(registry.all()), enabled=len(registry.enabled()))
