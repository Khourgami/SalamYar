"""Command-line tools: create-user, init-qa, list-agents, smoke-test, cost-report.

Usage: uv run python -m app.cli <command> [options]
"""

import argparse
import asyncio
import getpass
import sys
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any

from app.agents.config import AgentConfig
from app.agents.registry import Registry, RegistryError
from app.db import init_db, session_factory
from app.llm.client import LLMClient, LLMError
from app.services.user_service import MIN_PASSWORD_LENGTH, UserError, create_user


def _read_password(prompt: Callable[[str], str] | None = None) -> str:
    prompt = prompt or getpass.getpass
    password = prompt("Password: ")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise UserError(f"password must be at least {MIN_PASSWORD_LENGTH} characters")
    if prompt("Repeat password: ") != password:
        raise UserError("passwords do not match")
    return password


def _read_password_stdin() -> str:
    """First line of stdin (line ending and a leading BOM removed); same length rule."""
    password = sys.stdin.readline().rstrip("\r\n").lstrip("\ufeff")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise UserError(f"password must be at least {MIN_PASSWORD_LENGTH} characters")
    return password


def cmd_create_user(args: argparse.Namespace) -> int:
    try:
        password = _read_password_stdin() if args.password_stdin else _read_password()
        init_db()
        with session_factory()() as db:
            user = create_user(
                db,
                username=args.username,
                display_name=args.display_name,
                password=password,
                role=args.role,
            )
    except UserError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(f"created {user.role} '{user.username}' ({user.id})")
    return 0


def _load_registry(path: str | None) -> Registry:
    from app.settings import get_settings

    return _load_registry_from(path or get_settings().agents_config_path)


def _load_registry_from(path: str) -> Registry:
    registry = Registry(path)
    registry.load()
    return registry


def format_agents(agents: Sequence[AgentConfig]) -> str:
    header = ["id", "display_name", "architecture", "model", "enabled", "in_$/Mtok", "out_$/Mtok"]
    rows = [
        [
            a.id,
            a.display_name,
            a.architecture,
            a.model,
            "yes" if a.enabled else "no",
            f"{a.pricing.input_per_mtok:.10g}" if a.pricing else "-",
            f"{a.pricing.output_per_mtok:.10g}" if a.pricing else "-",
        ]
        for a in agents
    ]
    widths = [max(len(r[i]) for r in [header, *rows]) for i in range(len(header))]
    return "\n".join(
        "  ".join(c.ljust(w) for c, w in zip(row, widths, strict=True)).rstrip()
        for row in [header, *rows]
    )


def cmd_list_agents(args: argparse.Namespace) -> int:
    try:
        registry = _load_registry(args.config)
    except RegistryError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    print(format_agents(registry.all()))
    return 0


def select_agents(
    registry: Registry, agent_id: str | None, include_disabled: bool
) -> list[AgentConfig]:
    if agent_id:
        cfg = registry.get(agent_id)
        if cfg is None:
            raise RegistryError(f"unknown agent '{agent_id}'")
        return [cfg]
    return registry.all() if include_disabled else registry.enabled()


async def run_smoke(
    configs: Sequence[AgentConfig],
    llm: LLMClient,
    available: set[str] | None,
    json_path: str | None = None,
) -> int:
    from app.settings import get_settings
    from app.smoke import exit_code, format_table, smoke_test, write_json

    # D-038: the same turn/call deadlines as the running app
    results = await smoke_test(configs, llm, available, get_settings().new_turn_budget)
    print(format_table(results))
    if json_path:
        write_json(results, json_path)
        print(f"\nwrote {json_path}")
    missing = [r for r in results if r.model_found is False]
    if missing:
        print("\nModels not found on OpenRouter (fix config/agents.yaml):")
        for r in missing:
            print(f"  - {r.agent_id}: {r.model}")
    return exit_code(results)


def cmd_smoke_test(args: argparse.Namespace) -> int:
    from app.api.deps import get_llm
    from app.settings import get_settings
    from app.smoke import fetch_model_ids

    try:
        configs = select_agents(_load_registry(args.config), args.agent, args.include_disabled)
    except RegistryError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    if not configs:
        print("error: no agents selected", file=sys.stderr)
        return 2
    settings = get_settings()
    try:
        available = asyncio.run(
            fetch_model_ids(
                settings.openrouter_base_url, settings.openrouter_api_key.get_secret_value()
            )
        )
    except (LLMError, OSError) as exc:
        print(f"error: cannot list models: {exc}", file=sys.stderr)
        return 2
    return asyncio.run(run_smoke(configs, get_llm(), available, args.json))


def _local_settings() -> Any:
    """DATABASE_PATH and AGENTS_CONFIG_PATH from the environment or `.env` (no API key needed)."""
    from pydantic_settings import BaseSettings, SettingsConfigDict

    class _LocalSettings(BaseSettings):
        model_config = SettingsConfigDict(
            env_file=".env", env_file_encoding="utf-8", extra="ignore"
        )
        database_path: str = "data/lab.db"
        agents_config_path: str = "config/agents.yaml"

    return _LocalSettings()


def _database_path(explicit: str | None) -> str:
    """`--db`, else DATABASE_PATH from the environment or `.env` (no API key needed)."""
    return explicit or _local_settings().database_path


def _db_files(path: Path) -> list[Path]:
    """The SQLite file and its WAL/SHM companions that exist."""
    return [p for p in (path, Path(f"{path}-wal"), Path(f"{path}-shm")) if p.exists()]


def cmd_init_qa(args: argparse.Namespace) -> int:
    """Prepare a clean M3 database: schema, agents, one admin and one evaluator (phase 2d T4).
    Everything is validated before any file is moved or created."""
    from datetime import datetime

    from app import db as app_db

    local = _local_settings()
    path = Path(args.db or local.database_path)
    try:
        registry = _load_registry_from(args.config or local.agents_config_path)
    except RegistryError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    try:
        if not args.admin.strip() or not args.evaluator.strip():
            raise UserError("usernames must not be empty")
        if args.admin.strip() == args.evaluator.strip():
            raise UserError("--admin and --evaluator must be different usernames")
        admin_pw = _read_password_stdin()
        evaluator_pw = _read_password_stdin()
    except UserError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    existing = _db_files(path)
    if path.exists() and not args.force:
        print(
            f"error: {path} already exists; refusing to touch it (use --force to archive it first)",
            file=sys.stderr,
        )
        return 1
    if existing:  # --force (or leftover -wal/-shm files without the database)
        archive = path.parent / "archive" / datetime.now().strftime("%Y%m%d-%H%M%S")
        archive.mkdir(parents=True, exist_ok=True)
        try:
            for p in existing:
                p.rename(archive / p.name)
        except OSError as exc:
            print(f"error: cannot move {p} (in use by a running server?): {exc}", file=sys.stderr)
            return 1
        print(f"archived {', '.join(p.name for p in existing)} to {archive}")
    app_db.configure(str(path))
    app_db.init_db()
    with app_db.session_factory()() as db:
        registry.sync_to_db(db)
        for username, pw, role in (
            (args.admin, admin_pw, "admin"),
            (args.evaluator, evaluator_pw, "evaluator"),
        ):
            user = create_user(db, username=username, display_name=username, password=pw, role=role)
            print(f"created {user.role} '{user.username}'")
    enabled = registry.enabled()
    print(f"\ninitialized {path}; {len(enabled)} enabled agents:")
    for a in enabled:
        print(f"  {a.display_name}  {a.id}")
    return 0


def cmd_cost_report(args: argparse.Namespace) -> int:
    from app import db as app_db
    from app.db.engine import SchemaError, check_schema
    from app.services.cost_report import build_report, format_table, to_csv

    path = _database_path(args.db)
    if not Path(path).is_file():
        print(f"error: database not found: {path}", file=sys.stderr)
        return 2
    try:
        check_schema(app_db.configure(path))
    except SchemaError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    with app_db.session_factory()() as db:
        report = build_report(db, args.by, args.status)
    scope = "completed sessions" if args.status == "completed" else "all sessions"
    if report is None:
        print(f"no sessions ({scope}) in {path}")
        return 0
    print(f"Cost report by {args.by} — {scope} — {path}")
    print(format_table(report))
    if args.by != "session":
        print(
            "\nreported = OpenRouter usage.cost (source of truth); estimated = tokens × snapshot "
            "prices;\ndiff_pct = (estimated − reported) / reported over calls with both values; "
            ">15% marks |diff| > 15%."
        )
    if args.csv:
        Path(args.csv).write_bytes(to_csv(report))
        print(f"\nwrote {args.csv}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="app.cli", description="Triage Agent Lab backend tools")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("create-user", help="create an evaluator or admin user")
    p.add_argument("--username", required=True)
    p.add_argument("--display-name", required=True)
    p.add_argument("--role", required=True, choices=["evaluator", "admin"])
    p.add_argument(
        "--password-stdin",
        action="store_true",
        help="read the password from the first line of stdin instead of prompting",
    )
    p.set_defaults(func=cmd_create_user)

    p = sub.add_parser(
        "init-qa",
        help="create a clean M3 database with one admin and one evaluator",
        description=(
            "Refuses if the database exists (--force moves it and its -wal/-shm files to "
            "<db dir>/archive/<timestamp>/ first), creates the schema, syncs the agents and "
            "creates both users. Passwords are read from stdin: line 1 admin, line 2 evaluator."
        ),
    )
    p.add_argument("--admin", required=True, metavar="USERNAME")
    p.add_argument("--evaluator", required=True, metavar="USERNAME")
    p.add_argument("--force", action="store_true", help="archive an existing database first")
    p.add_argument("--db", metavar="PATH", help="SQLite file (default: DATABASE_PATH)")
    p.add_argument("--config", help="agents.yaml path (default: AGENTS_CONFIG_PATH)")
    p.set_defaults(func=cmd_init_qa)

    p = sub.add_parser("list-agents", help="print the configured agents")
    p.add_argument("--config", help="agents.yaml path (default: AGENTS_CONFIG_PATH)")
    p.set_defaults(func=cmd_list_agents)

    p = sub.add_parser("smoke-test", help="check model slugs and run a scripted conversation")
    p.add_argument("--agent", help="only this agent id")
    p.add_argument("--include-disabled", action="store_true", help="also test disabled agents")
    p.add_argument("--config", help="agents.yaml path (default: AGENTS_CONFIG_PATH)")
    p.add_argument("--json", metavar="PATH", help="also write the per-agent results as JSON")
    p.set_defaults(func=cmd_smoke_test)

    p = sub.add_parser(
        "cost-report", help="tokens and cost per session/agent/model/architecture/provider"
    )
    p.add_argument(
        "--by",
        choices=["session", "agent", "model", "architecture", "provider"],
        default="agent",
        help="grouping; 'provider' groups by 'model / serving provider(s)'",
    )
    p.add_argument("--status", choices=["completed", "all"], default="completed")
    p.add_argument("--csv", metavar="PATH", help="also write the table as CSV (UTF-8 with BOM)")
    p.add_argument("--db", metavar="PATH", help="SQLite file (default: DATABASE_PATH)")
    p.set_defaults(func=cmd_cost_report)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8")  # Persian output on Windows consoles
    args = build_parser().parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    sys.exit(main())
