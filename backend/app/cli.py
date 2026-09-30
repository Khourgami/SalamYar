"""Command-line tools: create-user, list-agents, smoke-test.

Usage: uv run python -m app.cli <command> [options]
"""

import argparse
import asyncio
import getpass
import sys
from collections.abc import Callable, Sequence

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

    registry = Registry(path or get_settings().agents_config_path)
    registry.load()
    return registry


def format_agents(agents: Sequence[AgentConfig]) -> str:
    header = ["id", "display_name", "architecture", "model", "enabled"]
    rows = [
        [a.id, a.display_name, a.architecture, a.model, "yes" if a.enabled else "no"]
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

    p = sub.add_parser("list-agents", help="print the configured agents")
    p.add_argument("--config", help="agents.yaml path (default: AGENTS_CONFIG_PATH)")
    p.set_defaults(func=cmd_list_agents)

    p = sub.add_parser("smoke-test", help="check model slugs and run a scripted conversation")
    p.add_argument("--agent", help="only this agent id")
    p.add_argument("--include-disabled", action="store_true", help="also test disabled agents")
    p.add_argument("--config", help="agents.yaml path (default: AGENTS_CONFIG_PATH)")
    p.add_argument("--json", metavar="PATH", help="also write the per-agent results as JSON")
    p.set_defaults(func=cmd_smoke_test)
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
