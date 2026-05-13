"""LeadStateMiddleware — declares the lead-triage canvas fields on the
agent's TypedDict state schema so they survive STATE_SNAPSHOT round-trips,
and hydrates a fresh thread's canvas from the canonical lead store on the
first turn.

Without the schema declaration the agent's state would only contain
``messages``, ``jump_to``, ``structured_response``, ``copilotkit``. When the
agent emits ``STATE_SNAPSHOT`` to the frontend, the snapshot replaces the
frontend's local ``agent.state``, wiping any keys (``leads``, ``header``,
``view``, ``segments``, …) the React handlers wrote via ``agent.setState``.

By declaring those keys here, LangGraph carries them through state-event
emission so the frontend's canvas state survives reloads of the run loop.

Hydration on a fresh thread:
- Each LangGraph thread is its own state slot. Without hydration, "+ new
  thread" gives the user an empty canvas even though the canonical lead
  store (Notion or local JSON) has 50 rows ready to go.
- ``before_agent`` runs once per turn, before the model fires. If
  ``state.leads`` is empty AND the lead store has rows, we return an
  update that pre-populates leads / view / header / sync — same shape
  ``fetch_notion_leads`` would write — so the canvas paints immediately
  instead of after the user explicitly imports.
- The check is "state.leads is empty", so within a thread that already
  imported, we never re-hydrate (and never overwrite user edits).

Field shapes mirror the TypeScript ``AgentState`` in
``src/lib/leads/types.ts``.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Annotated, Any, Optional

from langchain.agents.middleware.types import AgentMiddleware, AgentState
from typing_extensions import NotRequired, TypedDict


class _Header(TypedDict, total=False):
    title: str
    subtitle: str


class _SyncMeta(TypedDict, total=False):
    databaseId: str
    databaseTitle: str
    syncedAt: Optional[str]


class _LeadFilter(TypedDict, total=False):
    workshops: list[str]
    technical_levels: list[str]
    tools: list[str]
    opt_in: str
    search: str


class _Lead(TypedDict, total=False):
    id: str
    url: str
    name: str
    company: str
    email: str
    role: str
    phone: str
    source: str
    technical_level: str
    interested_in: list[str]
    tools: list[str]
    workshop: str
    opt_in: bool
    message: str
    submitted_at: str


class _Segment(TypedDict, total=False):
    id: str
    name: str
    description: str
    color: str
    leadIds: list[str]


def _replace(_left: Any, right: Any) -> Any:
    return right


class LeadCanvasState(AgentState):
    leads: NotRequired[Annotated[list[_Lead], _replace]]
    filter: NotRequired[Annotated[_LeadFilter, _replace]]
    view: NotRequired[Annotated[str, _replace]]
    segments: NotRequired[Annotated[list[_Segment], _replace]]
    highlightedLeadIds: NotRequired[Annotated[list[str], _replace]]
    selectedLeadId: NotRequired[Annotated[Optional[str], _replace]]
    header: NotRequired[Annotated[_Header, _replace]]
    sync: NotRequired[Annotated[_SyncMeta, _replace]]


class LeadStateMiddleware(AgentMiddleware[LeadCanvasState, Any]):

    state_schema = LeadCanvasState

    def before_agent(self, state: Any, runtime: Any) -> dict[str, Any] | None:
        existing_leads = (state or {}).get("leads") if isinstance(state, dict) else None
        if existing_leads:
            return None

        try:
            from lead_store import get_store
            store = get_store()

            if not store.is_local():
                return None

            rows = store.list_leads()
        except Exception:
            return None

        if not rows:
            return None

        from collections import Counter
        workshop_counts = Counter((r.get("workshop") or "Not sure yet") for r in rows)
        top_workshop, _ = workshop_counts.most_common(1)[0] if workshop_counts else ("Not sure yet", 0)

        return {
            "leads": rows,
            "header": {
                "title": "Purpose360 AI",
                "subtitle": f"{len(rows)} leads from local starter data",
            },
            "sync": {
                "databaseId": "local",
                "databaseTitle": store.database_title(),
                "syncedAt": datetime.now(timezone.utc).isoformat(),
            },
        }
