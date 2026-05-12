import pytest
from app.services.auth_service import generate_api_key, hash_key, verify_key


def test_generate_api_key():
    raw, prefix = generate_api_key()
    assert raw.startswith("sk-")
    assert len(raw) == 43
    assert raw[:8] == prefix


def test_hash_and_verify():
    raw, _ = generate_api_key()
    hashed = hash_key(raw)
    assert verify_key(raw, hashed)
    assert not verify_key("wrong-key", hashed)
