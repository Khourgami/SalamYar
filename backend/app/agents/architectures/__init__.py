from app.agents.architectures.simple import SimpleArchitecture
from app.agents.architectures.structured import StructuredArchitecture
from app.agents.base import Architecture
from app.agents.config import AgentConfig
from app.llm.client import LLMClient


def build_architecture(config: AgentConfig, llm: LLMClient) -> Architecture:
    if config.architecture == "simple":
        return SimpleArchitecture(llm)
    return StructuredArchitecture(llm)


__all__ = ["SimpleArchitecture", "StructuredArchitecture", "build_architecture"]
