import io
import pytest
from PIL import Image
from httpx import AsyncClient, ASGITransport


def make_test_image() -> bytes:
    img = Image.new("RGB", (100, 100), color=(100, 150, 200))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture(autouse=True)
async def init_test_db():
    from app.database import init_db
    await init_db()


@pytest.mark.asyncio
async def test_predict_no_key():
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/v1/predict", files={"file": ("test.jpg", make_test_image(), "image/jpeg")})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_predict_invalid_key():
    from app.database import init_db
    await init_db()
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/v1/predict",
            files={"file": ("test.jpg", make_test_image(), "image/jpeg")},
            headers={"X-API-Key": "invalid-key"},
        )
    assert response.status_code == 401
