"""CSV export of raw tables (API_CONTRACT §7): one row per DB row, UTF-8 with BOM."""

import csv
import io
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import models as m

EXPORT_TABLES: dict[str, type[m.Base]] = {
    "sessions": m.Session,
    "messages": m.Message,
    "evaluations": m.Evaluation,
    "feedback": m.MessageFeedback,
    "llm_calls": m.LLMCall,
    "assessments": m.Assessment,
}


def _cell(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)  # JSON columns are already JSON strings (ensure_ascii=False)


def export_csv(db: Session, table: str) -> bytes:
    """Return the table as CSV bytes encoded `utf-8-sig`. Raises KeyError for unknown tables."""
    model = EXPORT_TABLES[table]
    columns = [c.key for c in model.__table__.columns]  # type: ignore[attr-defined]
    order = model.updated_at if model is m.MessageFeedback else model.created_at  # type: ignore[attr-defined]
    buf = io.StringIO(newline="")
    writer = csv.writer(buf)
    writer.writerow(columns)
    for row in db.scalars(select(model).order_by(order)):
        writer.writerow([_cell(getattr(row, col)) for col in columns])
    return buf.getvalue().encode("utf-8-sig")
