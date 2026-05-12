import {
  CopilotRuntime,
  CopilotKitIntelligence,
  createCopilotRuntimeHandler,
} from "@copilotkit/runtime/v2";

const intelligence = new CopilotKitIntelligence({
  apiKey: process.env.INTELLIGENCE_API_KEY || "",
  apiUrl: process.env.INTELLIGENCE_API_URL || (process.env.NODE_ENV === 'production' ? "https://api.cloud.copilotkit.ai/v1" : "http://localhost:4203"),
});

const runtime = new CopilotRuntime({
  intelligence,
  identifyUser: () => ({ id: "default", name: "Purpose360 AI Professional" }),
  licenseToken: process.env.COPILOTKIT_LICENSE_TOKEN || process.env.NEXT_PUBLIC_COPILOTKIT_LICENSE_TOKEN,
  openGenerativeUI: true,
});

const baseHandler = createCopilotRuntimeHandler({
  runtime,
  basePath: "/api/copilotkit",
});

const handler = async (req: Request) => {
  try {
    console.log(`[CopilotKit] ${req.method} ${req.url}`);
    const res = await baseHandler(req);
    return res;
  } catch (error: any) {
    console.error("[CopilotKit] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};

export const GET = handler;
export const POST = handler;
