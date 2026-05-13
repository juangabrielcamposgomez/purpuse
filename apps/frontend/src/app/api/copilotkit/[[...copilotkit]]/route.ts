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

const langgraphUrl = process.env.LANGGRAPH_DEPLOYMENT_URL || "http://localhost:8133";

// Ensure URL is absolute and has protocol
const validatedUrl = langgraphUrl.startsWith("http") 
  ? langgraphUrl 
  : `https://${langgraphUrl}`;

console.log(`[CopilotKit] Initializing with Agent URL: ${validatedUrl}`);

const agent = new LangGraphAgent({
  deploymentUrl: validatedUrl,
  graphId: "default",
});

const runtime = new CopilotRuntime({
  identifyUser: () => ({ 
    id: "default", 
    name: "Purpose360 AI Professional",
    role: "Medical Expert"
  }),
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
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[CopilotKit][${requestId}] Incoming ${req.method} request to /api/copilotkit`);

  try {
    const res = await baseHandler(req);
    console.log(`[CopilotKit][${requestId}] Request processed successfully`);
    return res;
  } catch (error: any) {
    console.error(`[CopilotKit][${requestId}] CRITICAL ERROR:`, error);
    return new Response(
      JSON.stringify({ 
        error: "Internal Server Error in CopilotKit Runtime",
        message: error.message,
        requestId
      }), 
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const GET = handler;
export const POST = handler;
