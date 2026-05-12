import {
  CopilotRuntime,
  CopilotKitIntelligence,
  createCopilotRuntimeHandler,
} from "@copilotkit/runtime/v2";
import { LangGraphAgent } from "@copilotkit/runtime/langgraph";

/*
const intelligence = new CopilotKitIntelligence({
  apiKey: process.env.INTELLIGENCE_API_KEY || "",
  apiUrl: process.env.INTELLIGENCE_API_URL || (process.env.NODE_ENV === 'production' ? "https://api.cloud.copilotkit.ai/v1" : "http://localhost:4203"),
  wsUrl: process.env.INTELLIGENCE_GATEWAY_WS_URL || (process.env.NODE_ENV === 'production' ? "wss://api.cloud.copilotkit.ai/v1" : "ws://localhost:4403"),
});
*/

const agent = new LangGraphAgent({
  deploymentUrl: process.env.LANGGRAPH_DEPLOYMENT_URL || "http://localhost:8123",
  graphId: "default",
});

const runtime = new CopilotRuntime({
  // intelligence,
  identifyUser: () => ({ id: "default", name: "Purpose360 AI Professional" }),
  licenseToken: process.env.COPILOTKIT_LICENSE_TOKEN || process.env.NEXT_PUBLIC_COPILOTKIT_LICENSE_TOKEN,
  agents: {
    default: agent,
  },
  openGenerativeUI: true,
});

const baseHandler = createCopilotRuntimeHandler({
  runtime,
  basePath: "/api/copilotkit",
});

const handler = async (req: Request) => {
  try {
    const res = await baseHandler(req);
    return res;
  } catch (error: any) {
    console.error("[CopilotKit] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};

export const GET = handler;
export const POST = handler;
