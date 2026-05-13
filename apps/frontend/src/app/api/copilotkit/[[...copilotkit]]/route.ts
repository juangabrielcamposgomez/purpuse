import {
  CopilotRuntime,
  CopilotKitIntelligence,
  createCopilotRuntimeHandler,
} from "@copilotkit/runtime/v2";
import { LangGraphAgent } from "@copilotkit/runtime/langgraph";

const isProduction = process.env.NODE_ENV === 'production';

const intelligence = new CopilotKitIntelligence({
  apiKey: process.env.INTELLIGENCE_API_KEY || "",
  apiUrl: process.env.INTELLIGENCE_API_URL || (isProduction ? "https://api.cloud.copilotkit.ai/v1" : "http://localhost:4203"),
  wsUrl: process.env.INTELLIGENCE_GATEWAY_WS_URL || (isProduction ? "wss://api.cloud.copilotkit.ai/v1" : "ws://localhost:4403"),
});

const langgraphUrl = process.env.LANGGRAPH_DEPLOYMENT_URL || (isProduction ? "" : "http://localhost:8133");

const validatedUrl = langgraphUrl.startsWith("http")
  ? langgraphUrl
  : langgraphUrl
    ? `https://${langgraphUrl}`
    : "";

console.log(`[CopilotKit] Production=${isProduction} Agent URL: ${validatedUrl || "NOT SET"}`);

const runtimeConfig: any = {
  intelligence,
  identifyUser: () => ({
    id: "default",
    name: "Purpose360 AI Professional",
    role: "Medical Expert"
  }),
  licenseToken: process.env.COPILOTKIT_LICENSE_TOKEN || process.env.NEXT_PUBLIC_COPILOTKIT_LICENSE_TOKEN,
  openGenerativeUI: true,
};

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
}

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
    return res;
  } catch (error: any) {
    console.error(`[CopilotKit][${requestId}] Error:`, error);
    return new Response(
      JSON.stringify({
        error: "CopilotKit Runtime Error",
        message: error?.message || "Unknown error",
        requestId,
        hint: isProduction
          ? "Ensure LANGGRAPH_DEPLOYMENT_URL is set in Vercel env vars and the agent is deployed."
          : "Ensure the LangGraph agent is running locally (npm run dev:agent)."
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const GET = handler;
export const POST = handler;
