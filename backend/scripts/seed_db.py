#!/usr/bin/env python3
"""Creates the default admin key on first run. Run: python scripts/seed_db.py"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import init_db


async def main():
    await init_db()
    print("Database initialized.")


if __name__ == "__main__":
    asyncio.run(main())
