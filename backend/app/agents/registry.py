"""Agent registry: load/validate `config/agents.yaml`, reload, and sync to the `agents` table."""

import copy
import logging
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, ConfigDict, ValidationError
from sqlalchemy.orm import Session

from app.agents.config import AgentConfig, ModelPricing
from app.agents.prompts.loader import available_versions
from app.db.models import Agent
from app.db.types import dumps, utcnow

logger = logging.getLogger(__name__)


class RegistryError(ValueError):
    pass


class _AgentsFile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    defaults: dict[str, Any] = {}
    pricing: dict[str, ModelPricing] = {}
    agents: list[dict[str, Any]]


def deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    out = copy.deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = deep_merge(out[key], value)
        else:
            out[key] = copy.deepcopy(value)
    return out


def parse_agents(text: str) -> dict[str, AgentConfig]:
    """Validate a YAML document and return agents by id (file order). Raises RegistryError."""
    try:
        raw = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise RegistryError(f"invalid YAML: {exc}") from exc
    try:
        doc = _AgentsFile.model_validate(raw)
    except ValidationError as exc:
        raise RegistryError(f"invalid agents file: {exc}") from exc

    if "pricing" in doc.defaults:
        raise RegistryError("'pricing' is a top-level map keyed by model, not a default")
    agents: dict[str, AgentConfig] = {}
    names: set[str] = set()
    versions = set(available_versions())
    for i, entry in enumerate(doc.agents):
        if "pricing" in entry:
            raise RegistryError(
                f"agent #{i + 1} ({entry.get('id')!r}): 'pricing' belongs in the top-level map"
            )
        try:
            cfg = AgentConfig.model_validate(deep_merge(doc.defaults, entry))
        except ValidationError as exc:
            raise RegistryError(f"agent #{i + 1} ({entry.get('id')!r}) is invalid: {exc}") from exc
        price = doc.pricing.get(cfg.model)
        if price is None:  # D-035: every model used by any agent, enabled or not
            raise RegistryError(f"agent '{cfg.id}': no pricing entry for model '{cfg.model}'")
        cfg = cfg.model_copy(update={"pricing": price})
        if cfg.id in agents:
            raise RegistryError(f"duplicate agent id '{cfg.id}'")
        if cfg.display_name in names:
            raise RegistryError(f"duplicate display_name '{cfg.display_name}'")
        if cfg.prompt_version not in versions:
            raise RegistryError(f"agent '{cfg.id}': unknown prompt_version '{cfg.prompt_version}'")
        agents[cfg.id] = cfg
        names.add(cfg.display_name)
    return agents


class Registry:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self._agents: dict[str, AgentConfig] = {}

    def load(self) -> None:
        try:
            text = self.path.read_text(encoding="utf-8")
        except OSError as exc:
            raise RegistryError(f"cannot read {self.path}: {exc}") from exc
        self._agents = parse_agents(text)
        logger.info("Loaded %d agents (%d enabled)", len(self._agents), len(self.enabled()))

    def reload(self) -> None:
        """Load the file again; on any error keep the previous config and re-raise."""
        previous = self._agents
        try:
            self.load()
        except RegistryError:
            self._agents = previous
            raise

    def get(self, agent_id: str) -> AgentConfig | None:
        return self._agents.get(agent_id)

    def all(self) -> list[AgentConfig]:
        return list(self._agents.values())

    def enabled(self) -> list[AgentConfig]:
        return [a for a in self._agents.values() if a.enabled]

    def sync_to_db(self, db: Session) -> None:
        """Upsert every agent; agents no longer in the file are kept but disabled."""
        now = utcnow()
        existing = {a.id: a for a in db.query(Agent).all()}
        for cfg in self._agents.values():
            row = existing.pop(cfg.id, None)
            if row is None:
                row = Agent(id=cfg.id)
                db.add(row)
            row.display_name = cfg.display_name
            row.description = cfg.description
            row.architecture = cfg.architecture
            row.model = cfg.model
            row.config_json = dumps(cfg.model_dump(mode="json"))
            row.enabled = cfg.enabled
            row.updated_at = now
        for row in existing.values():
            if row.enabled:
                row.enabled = False
                row.updated_at = now
        db.commit()


_registry: Registry | None = None


def get_registry() -> Registry:
    """FastAPI dependency / global accessor. Loaded lazily from settings."""
    global _registry
    if _registry is None:
        from app.settings import get_settings

        reg = Registry(get_settings().agents_config_path)
        reg.load()
        _registry = reg
    return _registry


def set_registry(registry: Registry | None) -> None:
    global _registry
    _registry = registry
