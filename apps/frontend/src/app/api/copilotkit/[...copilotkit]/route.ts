import {
  CopilotRuntime,
  CopilotKitIntelligence,
  createCopilotRuntimeHandler,
} from "@copilotkit/runtime/v2";
import { LangGraphAgent } from "@copilotkit/runtime/langgraph";

const intelligence = new CopilotKitIntelligence({
  apiKey:
    process.env.INTELLIGENCE_API_KEY ?? "cpk_sPRVSEED_seed0privat0longtoken00",
  apiUrl: process.env.INTELLIGENCE_API_URL ?? (process.env.NODE_ENV === 'production' ? "https://api.cloud.copilotkit.ai/v1" : "http://localhost:4203"),
  wsUrl: process.env.INTELLIGENCE_GATEWAY_WS_URL ?? (process.env.NODE_ENV === 'production' ? "wss://api.cloud.copilotkit.ai/v1" : "ws://localhost:4403"),
});

const agent = new LangGraphAgent({
  deploymentUrl:
    process.env.LANGGRAPH_DEPLOYMENT_URL ?? "http://localhost:8123",
  graphId: "default",
  langsmithApiKey: process.env.LANGSMITH_API_KEY ?? "",
  assistantConfig: {
    recursion_limit: Number(process.env.LANGGRAPH_RECURSION_LIMIT ?? 60),
  },
});

const runtime = new CopilotRuntime({
  intelligence,
  identifyUser: () => ({ id: "default", name: "Purpose360 AI Professional" }),
  licenseToken: process.env.COPILOTKIT_LICENSE_TOKEN || process.env.NEXT_PUBLIC_COPILOTKIT_LICENSE_TOKEN,
  agents: { default: agent },
  openGenerativeUI: true,
  a2ui: { injectA2UITool: false },
  mcpApps: {
    servers: [
      {
        type: "http",
        url: process.env.MCP_SERVER_URL || "http://localhost:3001/mcp",
        serverId: "manufact_local",
      },
    ],
  },
});

const handler = createCopilotRuntimeHandler({
  runtime,
  basePath: "/api/copilotkit",
});

export const GET = handler;
export const POST = handler;
