import random

# Formulas from Marc Brooker, "Exponential Backoff And Jitter", AWS Architecture Blog (2015).
# attempt counts from 0; rand() returns a float in [0, 1).


def exponential(attempt: int, base: float, cap: float) -> float:
    """Capped exponential backoff, no jitter: min(cap, base * 2^attempt)."""
    # Clamp the exponent so a huge attempt overflows to inf (which min caps), not OverflowError.
    return min(cap, base * 2.0 ** min(attempt, 1023))


def full_jitter(attempt, base, cap, rand) -> float:
    """random_between(0, min(cap, base * 2^attempt))."""
    return rand() * exponential(attempt, base, cap)


def equal_jitter(attempt, base, cap, rand) -> float:
    """Half the window guaranteed, the other half random."""
    temp = exponential(attempt, base, cap)
    return temp / 2 + rand() * (temp / 2)


def decorrelated_jitter(prev, base, cap, rand) -> float:
    """min(cap, random_between(base, prev * 3)); start with prev = base."""
    return min(cap, base + rand() * (prev * 3 - base))


class RetryableError(Exception):
    """Raise (or subclass) this for failures that are worth another attempt."""


def retry(fn, max_attempts, sleep, *, base=100, cap=5000, rand=random.random, retryable=None):
    """Call fn() up to max_attempts times, sleeping with full jitter between attempts."""
    if max_attempts < 1:
        raise ValueError("max_attempts must be at least 1")
    if retryable is None:
        retryable = lambda e: isinstance(e, RetryableError)
    for attempt in range(max_attempts):
        try:
            return fn()
        except Exception as e:
            # Errors that will repeat (bad input, auth) fail fast; so does the last attempt.
            if not retryable(e) or attempt == max_attempts - 1:
                raise
        sleep(full_jitter(attempt, base, cap, rand))
