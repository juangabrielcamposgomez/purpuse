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

sys.path.append(str(Path(__file__).parent / "src"))

from intelligence_cleanup import wipe_orphan_threads
from lead_store import boot_status as _lead_store_boot_status
from notion_tools import load_notion_tools
from db_tools import load_db_tools
from prompts import build_system_prompt
from runtime import build_graph


def _select_runtime() -> str:
    runtime = os.getenv("AGENT_RUNTIME", "gemini-flash-react")
    valid = {"gemini-flash-deep", "gemini-flash-react", "claude-sonnet-4-6-react", "noop"}
    if runtime not in valid:
        print(f"[main] WARN: unknown AGENT_RUNTIME={runtime!r}, using gemini-flash-react", flush=True)
        return "gemini-flash-react"
    if runtime == "gemini-flash-deep":
        print("[main] NOTE: gemini-flash-deep uses deepagents planner — may be slower but more thorough", flush=True)
    return runtime


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

selected_runtime = _select_runtime()
print(f"[main] Runtime: {selected_runtime}", flush=True)

graph = build_graph(
    selected_runtime,
    tools=backend_tools,
    system_prompt=SYSTEM_PROMPT,
)


def main() -> None:
    import subprocess
    subprocess.run(
        ["langgraph", "dev", "--port", "8133"],
        check=True,
    )


if __name__ == "__main__":
    main()
