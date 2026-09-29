"""Run the API with the offline DemoLLM instead of OpenRouter (local development only).

    uv run python -m app.dev_server [--port 8000]

Everything else (DB, auth, registry) is real. No OpenRouter calls are made.
"""

import argparse

import uvicorn

from app.api.deps import get_llm
from app.llm.demo import DemoLLM
from app.main import app


def main() -> None:
    parser = argparse.ArgumentParser(description="API with the offline demo LLM")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    demo = DemoLLM()
    app.dependency_overrides[get_llm] = lambda: demo
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
