import random

# Formulas from Marc Brooker, "Exponential Backoff And Jitter", AWS Architecture Blog (2015).
# attempt counts from 0; rand() returns a float in [0, 1).


def exponential(attempt: int, base: float, cap: float) -> float:
    # TODO: min(cap, base * 2^attempt)
    return base


def full_jitter(attempt, base, cap, rand) -> float:
    # TODO: random_between(0, exponential window)
    return 0


def equal_jitter(attempt, base, cap, rand) -> float:
    # TODO: temp / 2 + random_between(0, temp / 2)
    return 0


def decorrelated_jitter(prev, base, cap, rand) -> float:
    # TODO: min(cap, random_between(base, prev * 3))
    return base


class RetryableError(Exception):
    """Raise (or subclass) this for failures that are worth another attempt."""


def retry(fn, max_attempts, sleep, *, base=100, cap=5000, rand=random.random, retryable=None):
    # TODO: validate max_attempts; default retryable = isinstance(e, RetryableError);
    # call fn(); on a retryable failure that is not the last attempt, call
    # sleep(full_jitter(attempt, base, cap, rand)) and try again; otherwise re-raise
    return fn()
