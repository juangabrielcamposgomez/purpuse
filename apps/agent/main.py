"""LangGraph entry point for `langgraph dev --port 8133`.

Wires:
- A switchable runtime (Gemini Flash-Lite + deepagents | Gemini Flash-Lite + react |
  Claude Sonnet 4.6 + react) selected by `AGENT_RUNTIME`. See
  `src/runtime.py` and the README's "Switching to a different model".
- Notion-MCP-backed backend tools (always present; Notion read goes through
  the official `@notionhq/notion-mcp-server` via mcp-use)
- TimingMiddleware (per-turn wall-time logging — see `src/timing.py`)
- LeadStateMiddleware + CopilotKitMiddleware for canvas state + AG-UI

Frontend tools (`createItem`, `setItemName`, `setProjectField1`, etc.) are
declared on the React side via `useFrontendTool({ name, parameters,
handler })` in `src/app/page.tsx`. The runtime forwards those declarations
into the agent's tool list at run time, so we deliberately do NOT include
the Python `frontend_tool_stubs` here — adding them would cause Gemini to
reject the request with "Duplicate function declaration found: <name>".
The Python stubs in `agent/src/canvas.py` exist purely as documentation of
the contract the frontend is expected to honor.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Add src to sys.path so imports work both in IDE (which sees src as root) 
# and during execution from the apps/agent directory.
sys.path.append(str(Path(__file__).parent / "src"))

from intelligence_cleanup import wipe_orphan_threads
from lead_store import boot_status as _lead_store_boot_status
from notion_tools import load_notion_tools
from db_tools import load_db_tools
from prompts import build_system_prompt
from runtime import build_graph


# Load .env early so GEMINI_API_KEY / NOTION_TOKEN / ANTHROPIC_API_KEY are visible.
# load_dotenv() # Already loaded by langgraph dev if configured, but safe to keep

# wipe_orphan_threads() # Commented out for stability during debug

def _format_integration_status() -> str:
    try:
        line = _lead_store_boot_status()
    except Exception as e:
        print(f"[lead_store] FAILED: {e}", flush=True)
        return f"error: {e}"
    print(f"[lead_store] {line}", flush=True)
    return line

backend_tools = load_notion_tools() + load_db_tools()
_integration_status = _format_integration_status()
SYSTEM_PROMPT = build_system_prompt(_integration_status)

# Force the runtime to gemini-flash-react for speed and stability
graph = build_graph(
    "gemini-flash-react",
    tools=backend_tools,
    system_prompt=SYSTEM_PROMPT,
)


def main() -> None:
    """Entry point for `uv run dev` / `python -m agent`.

    `langgraph dev` is the canonical local-dev runner — this just exists to
    satisfy the `[project.scripts] dev = "agent:main"` entry point.
    """
    import subprocess

    subprocess.run(
        ["langgraph", "dev", "--port", "8133"],
        check=True,
    )


if __name__ == "__main__":
    main()
