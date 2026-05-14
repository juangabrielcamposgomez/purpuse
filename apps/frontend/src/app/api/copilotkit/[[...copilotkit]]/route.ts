import {
  CopilotRuntime,
  CopilotKitIntelligence,
  createCopilotRuntimeHandler,
} from "@copilotkit/runtime/v2";
import { LangGraphAgent } from "@copilotkit/runtime/langgraph";

const isProduction = process.env.NODE_ENV === 'production';

function warnMissing(v: string): void {
  if (!process.env[v]) console.log(`[CopilotKit] WARNING: ${v} not set`);
}

console.log(`[CopilotKit] Production=${isProduction}`);

const runtimeConfig: any = {
  identifyUser: () => ({
    id: "default",
    name: "Purpose360 AI Professional",
    role: "Medical Expert",
  }),
  licenseToken:
    process.env.COPILOTKIT_LICENSE_TOKEN ||
    process.env.NEXT_PUBLIC_COPILOTKIT_LICENSE_TOKEN,
  openGenerativeUI: true,
};

// ---------------------------------------------------------------------------
// Intelligence (thread persistence via CopilotKit Cloud)
// ---------------------------------------------------------------------------
const intelligenceApiKey = process.env.INTELLIGENCE_API_KEY;
if (intelligenceApiKey) {
  runtimeConfig.intelligence = new CopilotKitIntelligence({
    apiKey: intelligenceApiKey,
    apiUrl: process.env.INTELLIGENCE_API_URL || "https://api.cloud.copilotkit.ai/v1",
    wsUrl: process.env.INTELLIGENCE_GATEWAY_WS_URL || "wss://api.cloud.copilotkit.ai/v1",
  });
  console.log(`[CopilotKit] Intelligence enabled (cloud)`);
} else {
  warnMissing("INTELLIGENCE_API_KEY");
}

// ---------------------------------------------------------------------------
// LangGraph Agent
// ---------------------------------------------------------------------------
const langgraphUrl = process.env.LANGGRAPH_DEPLOYMENT_URL || "";
const validatedUrl = langgraphUrl.startsWith("http")
  ? langgraphUrl
  : langgraphUrl
    ? `https://${langgraphUrl}`
    : "";

if (validatedUrl) {
  runtimeConfig.agents = {
    default: new LangGraphAgent({
      deploymentUrl: validatedUrl,
      graphId: "default",
      langsmithApiKey: process.env.LANGSMITH_API_KEY || "",
      assistantConfig: {
        recursion_limit: Number(process.env.LANGGRAPH_RECURSION_LIMIT ?? 60),
      },
    }),
  };
  console.log(`[CopilotKit] Agent configured: ${validatedUrl}`);
} else {
  warnMissing("LANGGRAPH_DEPLOYMENT_URL");
}

// ---------------------------------------------------------------------------
// MCP Apps (Manufact widgets)
// ---------------------------------------------------------------------------
const mcpUrl = process.env.MCP_SERVER_URL || "";
if (mcpUrl) {
  runtimeConfig.mcpApps = {
    servers: [
      {
        type: "http" as const,
        url: mcpUrl,
        serverId: "manufact_cloud",
      },
    ],
  };
  console.log(`[CopilotKit] MCP server configured: ${mcpUrl}`);
} else if (isProduction) {
  warnMissing("MCP_SERVER_URL");
}

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------
const runtime = new CopilotRuntime(runtimeConfig);

const baseHandler = createCopilotRuntimeHandler({
  runtime,
  basePath: "/api/copilotkit",
});

const handler = async (req: Request) => {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[CopilotKit][${requestId}] ${req.method} /api/copilotkit`);

  try {
    const res = await baseHandler(req);
    if (!res.ok) {
      const text = await res.clone().text();
      console.error(`[CopilotKit][${requestId}] HTTP ${res.status}: ${text.slice(0, 500)}`);

      // Rewrite known 5xx error bodies into structured payloads
      if (res.status >= 500) {
        const isThreadFkey =
          text.includes("threads_user_id_fkey") ||
          (text.includes("Failed to initialize thread") && text.includes("user_id"));
        if (isThreadFkey) {
          return new Response(
            JSON.stringify({
              error: "Postgres user seed missing",
              hint: "Contact support to seed the default user.",
            }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
        const isThreadLocked =
          text.includes("AgentThreadLockedError") ||
          /Thread\s+[0-9a-f-]{36}\s+is locked/i.test(text);
        if (isThreadLocked) {
          return new Response(
            JSON.stringify({
              error: "Thread is locked",
              hint: "Start a new conversation to continue.",
            }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
      }
    }
    return res;
  } catch (error: any) {
    console.error(`[CopilotKit][${requestId}] Error:`, error?.message || error);
    return new Response(
      JSON.stringify({
        error: "CopilotKit Runtime Error",
        message: error?.message || "Unknown error",
        requestId,
        hint: isProduction
          ? "Set INTELLIGENCE_API_KEY, LANGGRAPH_DEPLOYMENT_URL, and MCP_SERVER_URL in Vercel env vars."
          : "Ensure the LangGraph agent is running locally (npm run dev:agent).",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const GET = handler;
export const POST = handler;
