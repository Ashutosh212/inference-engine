import hashlib
import secrets
import string
import bcrypt
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.db_models import APIKey


def generate_api_key() -> tuple[str, str]:
    alphabet = string.ascii_letters + string.digits
    raw = "sk-" + "".join(secrets.choice(alphabet) for _ in range(40))
    prefix = raw[:8]
    return raw, prefix


def hash_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode()).hexdigest()


def verify_key(raw_key: str, stored_hash: str) -> bool:
    return hash_key(raw_key) == stored_hash


async def get_api_key(db: AsyncSession, raw_key: str) -> APIKey | None:
    key_hash = hash_key(raw_key)
    result = await db.execute(
        select(APIKey).where(APIKey.key_hash == key_hash, APIKey.is_active == True)
    )
    return result.scalar_one_or_none()


async def validate_api_key(db: AsyncSession, raw_key: str) -> APIKey | None:
    api_key = await get_api_key(db, raw_key)
    if api_key is None:
        return None
    api_key.last_used_at = datetime.now(timezone.utc)
    api_key.total_requests += 1
    await db.flush()
    return api_key
