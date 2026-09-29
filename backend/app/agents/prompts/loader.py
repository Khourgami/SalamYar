"""Prompt loading and rendering (AGENT_SPEC §4–§8).

Placeholders are `{name}` tokens replaced with `str.replace` — never `str.format`, because the
prompts contain literal JSON braces. `{common_clinician}` and the two schema descriptions are
always filled; callers pass the rest (`end_reason`, `validation_error`).
"""

import json
from functools import cache
from pathlib import Path

from app.agents.clinical_schemas import AssessmentResult, TurnDecision

PROMPTS_DIR = Path(__file__).parent


class PromptError(LookupError):
    pass


def available_versions() -> list[str]:
    return sorted(p.name for p in PROMPTS_DIR.iterdir() if p.is_dir() and p.name[0] != "_")


@cache
def load(name: str, prompt_version: str = "v1") -> str:
    path = PROMPTS_DIR / prompt_version / f"{name}.md"
    if not path.is_file():
        raise PromptError(f"prompt '{name}' not found for version '{prompt_version}'")
    text = path.read_text(encoding="utf-8")
    return text.removesuffix("\n")


def schema_description(model: type[AssessmentResult] | type[TurnDecision]) -> str:
    return json.dumps(model.model_json_schema(), ensure_ascii=False, indent=2)


def _fill(text: str, values: dict[str, str]) -> str:
    for key, value in values.items():
        text = text.replace("{" + key + "}", value)
    return text


def render(name: str, prompt_version: str = "v1", **variables: str) -> str:
    """Render a prompt. Built-in placeholders are filled first, caller variables last."""
    builtins = {
        "common_clinician": load("common_clinician", prompt_version),
        "assessment_result_schema_description": schema_description(AssessmentResult),
        "turn_decision_schema_description": schema_description(TurnDecision),
    }
    return _fill(_fill(load(name, prompt_version), builtins), variables)
