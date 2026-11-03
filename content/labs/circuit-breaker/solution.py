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
        self._state = CLOSED
        self.failures = 0     # consecutive failures while closed
        self.opened_at = 0.0
        self.trials = 0       # trial calls admitted in this half-open period
        self.successes = 0    # trial calls that succeeded

    def state(self) -> str:
        # Open turns into half-open lazily, the first time anyone looks after the cooldown.
        if self._state == OPEN and self.now() - self.opened_at >= self.reset_timeout:
            self._state, self.trials, self.successes = HALF_OPEN, 0, 0
        return self._state

    def _open(self):
        self._state, self.opened_at = OPEN, self.now()

    def allow_request(self) -> None:
        s = self.state()
        if s == OPEN:
            raise CircuitOpenError("circuit open")
        if s == HALF_OPEN:
            if self.trials >= self.half_open_max_calls:
                raise CircuitOpenError("half-open: trial calls already in flight")
            self.trials += 1

    def record_success(self) -> None:
        if self._state == HALF_OPEN:
            self.successes += 1
            if self.successes >= self.half_open_max_calls:
                self._state, self.failures = CLOSED, 0
        else:
            self.failures = 0

    def record_failure(self) -> None:
        if self._state == HALF_OPEN:
            self._open()  # the dependency is still sick: wait a full cooldown again
        elif self._state == CLOSED:
            self.failures += 1
            if self.failures >= self.failure_threshold:
                self._open()

    def call(self, fn):
        self.allow_request()  # raises CircuitOpenError without touching fn
        try:
            result = fn()
        except Exception:
            self.record_failure()
            raise
        self.record_success()
        return result
