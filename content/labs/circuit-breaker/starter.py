import time

CLOSED, OPEN, HALF_OPEN = "closed", "open", "half_open"


class CircuitOpenError(Exception):
    """Raised instead of calling the dependency while the breaker is open."""


class CircuitBreaker:
    def __init__(self, failure_threshold=5, reset_timeout=30.0, half_open_max_calls=1, now=time.monotonic):
        self.failure_threshold = failure_threshold
        self.reset_timeout = reset_timeout
        self.half_open_max_calls = half_open_max_calls
        self.now = now
        # TODO: state, consecutive failure count, time opened, half-open trial counters

    def state(self) -> str:
        # TODO: if open and reset_timeout has elapsed on self.now(), become half-open
        return CLOSED

    def allow_request(self) -> None:
        # TODO: open -> raise CircuitOpenError; half-open -> admit at most half_open_max_calls trials
        pass

    def record_success(self) -> None:
        # TODO: closed -> reset failures; half-open -> close after half_open_max_calls successes
        pass

    def record_failure(self) -> None:
        # TODO: closed -> count, open at failure_threshold; half-open -> reopen (restart cooldown)
        pass

    def call(self, fn):
        # TODO: allow_request(), run fn, record the outcome, re-raise fn's own exception
        return fn()
