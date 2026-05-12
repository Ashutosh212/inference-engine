import uuid
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from app.database import get_db
from app.models.db_models import APIKey
from app.models.schemas import APIKeyCreate, APIKeyUpdate, APIKeyResponse, APIKeyCreateResponse, APIResponse
from app.services.auth_service import generate_api_key, hash_key, validate_api_key

router = APIRouter(prefix="/v1/api-keys", tags=["API Keys"])


async def require_admin(x_api_key: Optional[str] = Header(None, alias="X-API-Key"), db: AsyncSession = Depends(get_db)) -> APIKey:
    if not x_api_key:
        raise HTTPException(status_code=401, detail="X-API-Key header required")
    api_key = await validate_api_key(db, x_api_key)
    if not api_key:
        raise HTTPException(status_code=401, detail="Invalid or inactive API key")
    if not api_key.is_admin:
        raise HTTPException(status_code=403, detail="Admin key required")
    return api_key


@router.post("", response_model=APIResponse)
async def create_api_key(body: APIKeyCreate, _: APIKey = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    raw_key, prefix = generate_api_key()
    key_hash = hash_key(raw_key)
    api_key = APIKey(
        id=str(uuid.uuid4()),
        key_hash=key_hash,
        key_prefix=prefix,
        name=body.name,
        rate_limit=body.rate_limit,
        is_admin=body.is_admin,
    )
    db.add(api_key)
    await db.flush()
    await db.refresh(api_key)
    response_data = APIKeyCreateResponse(
        id=api_key.id,
        key_prefix=api_key.key_prefix,
        name=api_key.name,
        created_at=api_key.created_at,
        last_used_at=api_key.last_used_at,
        is_active=api_key.is_active,
        is_admin=api_key.is_admin,
        rate_limit=api_key.rate_limit,
        total_requests=api_key.total_requests,
        full_key=raw_key,
    )
    return APIResponse(data=response_data.model_dump())


@router.get("", response_model=APIResponse)
async def list_api_keys(_: APIKey = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(APIKey).order_by(APIKey.created_at.desc()))
    keys = result.scalars().all()
    data = [APIKeyResponse.model_validate(k).model_dump() for k in keys]
    return APIResponse(data=data)


@router.delete("/{key_id}", response_model=APIResponse)
async def revoke_api_key(key_id: str, _: APIKey = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(APIKey).where(APIKey.id == key_id))
    api_key = result.scalar_one_or_none()
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")
    api_key.is_active = False
    await db.flush()
    return APIResponse(data={"revoked": True, "id": key_id})


@router.patch("/{key_id}", response_model=APIResponse)
async def update_api_key(key_id: str, body: APIKeyUpdate, _: APIKey = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(APIKey).where(APIKey.id == key_id))
    api_key = result.scalar_one_or_none()
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")
    if body.name is not None:
        api_key.name = body.name
    if body.rate_limit is not None:
        api_key.rate_limit = body.rate_limit
    if body.is_active is not None:
        api_key.is_active = body.is_active
    await db.flush()
    return APIResponse(data=APIKeyResponse.model_validate(api_key).model_dump())
