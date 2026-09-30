"""Turn and call deadlines (D-038, BACKEND_ARCHITECTURE §6.3).

One `TurnBudget` covers every LLM call of one `next_turn` / `force_conclude` (transport retry and
repair included). Each call runs under `min(call_seconds, remaining)` as a total deadline, and a
follow-up call (transport retry, repair, B's assessment after a turn call) starts only if at least
`min_follow_up_seconds` of the turn remain.
"""

import time
from collections.abc import Callable

from app.llm.client import LLMError

DEFAULT_TURN_SECONDS = 80.0
DEFAULT_CALL_SECONDS = 50.0
MIN_FOLLOW_UP_SECONDS = 15.0
DEADLINE_ERROR = "deadline_exceeded"  # `llm_calls.error` of an attempt cut by the deadline


class DeadlineExceeded(LLMError):
    """The turn budget ran out (or is too short for a follow-up call). Ends the turn as 502."""


class TurnBudget:
    def __init__(
        self,
        turn_seconds: float = DEFAULT_TURN_SECONDS,
        call_seconds: float = DEFAULT_CALL_SECONDS,
        *,
        min_follow_up_seconds: float = MIN_FOLLOW_UP_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.turn_seconds = turn_seconds
        self.call_seconds = call_seconds
        self.min_follow_up_seconds = min_follow_up_seconds
        self._clock = clock
        self._deadline = clock() + turn_seconds

    def remaining(self) -> float:
        return max(0.0, self._deadline - self._clock())

    def call_timeout(self) -> float:
        """Total deadline for the next call: `min(call_seconds, remaining turn budget)`."""
        return min(self.call_seconds, self.remaining())

    def can_follow_up(self) -> bool:
        return self.remaining() >= self.min_follow_up_seconds

    def require_follow_up(self, what: str) -> None:
        if not self.can_follow_up():
            raise DeadlineExceeded(
                f"{DEADLINE_ERROR}: {what} skipped, {self.remaining():.1f} s of the "
                f"{self.turn_seconds:g} s turn budget left"
            )
