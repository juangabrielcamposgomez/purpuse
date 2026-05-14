"""PostgreSQL connection pool with auto-creation of schema tables.

Reads DATABASE_URL from env (default: local Docker postgres on port 5432).
If the connection fails, `is_connected()` returns False and callers
fall back to in-memory storage.

On first successful connect, runs CREATE TABLE IF NOT EXISTS so the
schema is always up to date — no manual migration step needed for dev.
"""

from __future__ import annotations

import os
import json
from pathlib import Path
from typing import Any, Optional

_CONSTANTS_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "constants.json"
_IS_PRODUCTION = os.getenv("AGENT_ENV") == "production"


def _load_pillar_keys() -> list[str]:
    try:
        return json.loads(_CONSTANTS_PATH.read_text(encoding="utf-8")).get("pillar_keys", [])
    except Exception:
        return ["posicionamiento", "visibilidad", "identidad", "humanizacion"]


PILLAR_KEYS = _load_pillar_keys()

# ---------------------------------------------------------------------------
# Pool (lazy singleton)
# ---------------------------------------------------------------------------

_pool: Any = None
_pool_lock: Any = None


def _get_pool():
    """Return the psycopg connection pool, or None on failure."""
    global _pool, _pool_lock  # noqa: PLW0603
    if _pool is not None:
        return _pool

    if _pool_lock is None:
        import threading
        _pool_lock = threading.Lock()

    with _pool_lock:
        if _pool is not None:
            return _pool

        try:
            import psycopg_pool
        except ImportError:
            print("[db] psycopg_pool not installed — falling back to in-memory store")
            _pool = False
            return None

        dsn = os.getenv("DATABASE_URL")
        if not dsn:
            if _IS_PRODUCTION:
                raise RuntimeError("DATABASE_URL is required in production")
            dsn = "postgresql://intelligence:intelligence@localhost:5432/intelligence_app"
        try:
            import psycopg
            # Quick connectivity check with short timeout
            conn = psycopg.connect(dsn, connect_timeout=2)
            conn.close()
            # Connectivity confirmed — open the pool
            _pool = psycopg_pool.ConnectionPool(
                dsn,
                min_size=1,
                max_size=3,
                open=True,
                kwargs={"connect_timeout": 2},
            )
            _ensure_schema(_pool)
            safe_dsn = dsn.split('@')[1].encode('ascii', errors='replace').decode('ascii')
            print(f"[db] Connected to Postgres at {safe_dsn}")
            return _pool
        except Exception as exc:
            safe_msg = str(exc).encode('ascii', errors='replace').decode('ascii')
            print(f"[db] Postgres not available: {safe_msg} -- falling back to in-memory store")
            _pool = False
            return None


def is_connected() -> bool:
    """True if the real Postgres pool is healthy."""
    pool = _get_pool()
    return pool is not None and pool is not False


class _PoolConnection:
    """Wraps a pool connection, setting autocommit=True on enter."""
    def __init__(self, pool):
        self._pool = pool
        self._conn = None

    def __enter__(self):
        if not self._pool:
            return None
        try:
            self._conn = self._pool.connection()
            self._conn.autocommit = True
            return self._conn
        except Exception:
            return None

    def __exit__(self, *args):
        if self._conn:
            try:
                self._conn.close()
            except Exception:
                pass


def connection():
    """Context manager: yield a psycopg connection from the pool, or None."""
    pool = _get_pool()
    if not pool:
        return _NullConnection()
    return _PoolConnection(pool)


class _NullConnection:
    """Stand-in so callers can write `with connection() as conn:` without
    branching on is_connected() every time."""
    def __enter__(self):
        return None

    def __exit__(self, *args): ...


def _null_connection():
    return _NullConnection()


def close():
    """Shut down the pool (call on agent shutdown)."""
    global _pool  # noqa: PLW0603
    if _pool and _pool is not False:
        try:
            _pool.close()
        except Exception:
            pass
    _pool = None


# ---------------------------------------------------------------------------
# Schema auto-creation
# ---------------------------------------------------------------------------

_SCHEMA_SQL = """
CREATE SCHEMA IF NOT EXISTS cpki;

CREATE TABLE IF NOT EXISTS public.expert_context (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    specialty TEXT NOT NULL DEFAULT '',
    profile_data JSONB NOT NULL DEFAULT '{}',
    goals JSONB NOT NULL DEFAULT '[]',
    target_audience TEXT NOT NULL DEFAULT '',
    services JSONB NOT NULL DEFAULT '[]',
    user_id TEXT REFERENCES cpki.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pillar_type') THEN
        CREATE TYPE pillar_type AS ENUM ('posicionamiento', 'visibilidad', 'identidad', 'humanizacion');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.pillar_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expert_id UUID REFERENCES public.expert_context(id) ON DELETE CASCADE,
    type pillar_type NOT NULL,
    score INTEGER CHECK (score >= 0 AND score <= 100) DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'not_started',
    next_action TEXT NOT NULL DEFAULT '',
    history JSONB NOT NULL DEFAULT '[]',
    audit_data JSONB NOT NULL DEFAULT '{}',
    recommendations JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.social_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expert_id UUID REFERENCES public.expert_context(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    account_name VARCHAR(255),
    external_id TEXT,
    access_token_secret_id UUID,
    refresh_token_secret_id UUID,
    expires_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(expert_id, platform)
);

CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expert_id UUID REFERENCES public.expert_context(id) ON DELETE CASCADE,
    pillar_id UUID REFERENCES public.pillar_audits(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    platform VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'draft',
    budget DECIMAL(12,2),
    content_plan JSONB NOT NULL DEFAULT '{}',
    performance_metrics JSONB NOT NULL DEFAULT '{}',
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pillar_audit_expert ON public.pillar_audits(expert_id);
CREATE INDEX IF NOT EXISTS idx_social_conn_expert ON public.social_connections(expert_id);
CREATE INDEX IF NOT EXISTS idx_mkt_campaign_expert ON public.marketing_campaigns(expert_id);
"""


def _ensure_schema(pool: Any) -> None:
    """Run CREATE TABLE IF NOT EXISTS so the schema is always present."""
    try:
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(_SCHEMA_SQL)
            conn.commit()
        print("[db] Schema ensured")
    except Exception as exc:
        print(f"[db] Schema creation skipped (non-fatal): {exc}")
