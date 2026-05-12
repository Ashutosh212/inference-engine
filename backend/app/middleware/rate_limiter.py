import time
from collections import defaultdict
from typing import Optional
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp


class TokenBucket:
    def __init__(self, rate: int, capacity: int):
        self.rate = rate
        self.capacity = capacity
        self.tokens = float(capacity)
        self.last_refill = time.time()

    def consume(self) -> tuple[bool, float]:
        now = time.time()
        elapsed = now - self.last_refill
        self.tokens = min(self.capacity, self.tokens + elapsed * (self.rate / 60.0))
        self.last_refill = now

        if self.tokens >= 1:
            self.tokens -= 1
            return True, 0.0
        else:
            wait = (1 - self.tokens) / (self.rate / 60.0)
            return False, wait


_buckets: dict[str, TokenBucket] = defaultdict(lambda: TokenBucket(60, 60))


class RateLimiterMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        if not request.url.path.startswith("/v1/predict"):
            return await call_next(request)

        api_key_header = request.headers.get("X-API-Key")
        if not api_key_header:
            return await call_next(request)

        bucket_key = api_key_header[:16]
        bucket = _buckets[bucket_key]

        allowed, retry_after = bucket.consume()
        if not allowed:
            return Response(
                content='{"data":null,"error":{"code":"rate_limit_exceeded","message":"Rate limit exceeded"}}',
                status_code=429,
                headers={"Retry-After": str(int(retry_after) + 1), "Content-Type": "application/json"},
            )

        return await call_next(request)
