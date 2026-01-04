/**
 * DevCopilot Chat API Route
 *
 * This is a Next.js API route that handles communication between
 * a Next.js frontend and the Cloudflare Worker backend.
 *
 * To use this:
 * 1. Create a Next.js app: npx create-next-app@latest devcopilot-frontend
 * 2. Copy this file to: app/api/chat/route.ts
 * 3. Set DEVCOPILOT_WORKER_URL in .env.local
 *
 * Request Flow:
 * 1. Frontend sends POST to /api/chat
 * 2. This route validates and sanitizes the request
 * 3. Forwards to Cloudflare Worker backend
 * 4. Streams or returns the response to frontend
 *
 * @module api/chat/route
 */

// =============================================================================
// Imports & Types
// =============================================================================

import type {
  ChatRequest,
  ChatResponse,
  ErrorResponse,
  ProjectContext,
  StreamChunk
} from "../types";

import {
  validateChatRequest,
  sanitizeInput,
  generateSessionId
} from "../types";

import {
  chatRateLimiter,
  getClientIdentifier,
  createRateLimitResponse
} from "../rate-limiter";

// =============================================================================
// Configuration
// =============================================================================

/**
 * Environment variables
 * Set these in .env.local for Next.js:
 *
 * DEVCOPILOT_WORKER_URL=https://your-worker.your-subdomain.workers.dev
 * DEVCOPILOT_API_KEY=optional-api-key-for-auth
 */
const WORKER_URL = process.env.DEVCOPILOT_WORKER_URL || "http://localhost:8787";
const API_KEY = process.env.DEVCOPILOT_API_KEY;

/**
 * CORS headers for local development
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin":
    process.env.NODE_ENV === "development"
      ? "*"
      : process.env.ALLOWED_ORIGIN || "https://your-domain.com",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Session-Id",
  "Access-Control-Max-Age": "86400"
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create an error response
 */
function createErrorResponse(
  message: string,
  code: string,
  status: number,
  details?: Record<string, unknown>
): Response {
  const body: ErrorResponse = {
    error: true,
    message,
    code,
    status,
    details
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS
    }
  });
}

/**
 * Create a success response
 */
function createSuccessResponse(data: ChatResponse): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS
    }
  });
}

/**
 * Forward request to Cloudflare Worker and handle streaming
 */
async function forwardToWorker(
  message: string,
  sessionId: string,
  projectContext?: ProjectContext,
  stream = false
): Promise<Response> {
  // Build the worker request
  const workerUrl = new URL("/api/chat", WORKER_URL);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Session-Id": sessionId
  };

  // Add API key if configured
  if (API_KEY) {
    headers.Authorization = `Bearer ${API_KEY}`;
  }

  // Prepare the request body
  const body = JSON.stringify({
    message: sanitizeInput(message),
    sessionId,
    projectContext,
    stream
  });

  try {
    const response = await fetch(workerUrl.toString(), {
      method: "POST",
      headers,
      body
    });

    return response;
  } catch (error) {
    console.error("[DevCopilot API] Worker request failed:", error);
    throw new Error("Failed to connect to DevCopilot backend");
  }
}

/**
 * Parse streaming response from Worker (exported for frontend use)
 */
export async function* parseStreamingResponse(
  response: Response
): AsyncGenerator<StreamChunk> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Parse Server-Sent Events format
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            yield { type: "done" };
            return;
          }
          try {
            const chunk = JSON.parse(data) as StreamChunk;
            yield chunk;
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// =============================================================================
// Route Handlers
// =============================================================================

/**
 * Handle OPTIONS request (CORS preflight)
 */
export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}

/**
 * Handle GET request (health check)
 */
export async function GET(): Promise<Response> {
  return new Response(
    JSON.stringify({
      status: "ok",
      service: "devcopilot-api",
      version: "1.0.0",
      workerUrl: WORKER_URL,
      timestamp: new Date().toISOString()
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS
      }
    }
  );
}

/**
 * Handle POST request (chat message)
 *
 * Request body:
 * {
 *   message: string,        // Required: The user's message
 *   sessionId?: string,     // Optional: Session ID for continuity
 *   projectContext?: {      // Optional: Project context
 *     workerCode?: string,
 *     errorLogs?: string[],
 *     cloudflareServices?: string[],
 *     projectName?: string
 *   },
 *   stream?: boolean        // Optional: Enable streaming (default: false)
 * }
 *
 * Response (non-streaming):
 * {
 *   response: string,
 *   toolsUsed?: string[],
 *   toolResults?: ToolResult[],
 *   sessionId: string,
 *   timestamp: string,
 *   usage?: { promptTokens, completionTokens, totalTokens }
 * }
 *
 * Response (streaming):
 * Server-Sent Events with StreamChunk objects
 */
export async function POST(request: Request): Promise<Response> {
  const startTime = Date.now();

  // ==========================================================================
  // 1. Rate Limiting
  // ==========================================================================

  const clientId = getClientIdentifier(request);
  const rateLimitResult = chatRateLimiter.check(clientId);

  if (!rateLimitResult.allowed) {
    console.warn(`[DevCopilot API] Rate limited: ${clientId}`);
    return createRateLimitResponse(rateLimitResult);
  }

  // ==========================================================================
  // 2. Parse & Validate Request
  // ==========================================================================

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createErrorResponse(
      "Invalid JSON in request body",
      "INVALID_JSON",
      400
    );
  }

  const validation = validateChatRequest(body);
  if (!validation.valid) {
    return createErrorResponse(
      `Validation failed: ${validation.errors.join(", ")}`,
      "VALIDATION_ERROR",
      400,
      { errors: validation.errors }
    );
  }

  const chatRequest = body as ChatRequest;

  // Generate session ID if not provided
  const sessionId = chatRequest.sessionId || generateSessionId();
  const wantsStream = (body as { stream?: boolean }).stream === true;

  // ==========================================================================
  // 3. Forward to Cloudflare Worker
  // ==========================================================================

  try {
    console.log(
      `[DevCopilot API] Processing request for session: ${sessionId}`
    );

    const workerResponse = await forwardToWorker(
      chatRequest.message,
      sessionId,
      chatRequest.projectContext,
      wantsStream
    );

    // Check if worker returned an error
    if (!workerResponse.ok) {
      const errorText = await workerResponse.text();
      console.error(`[DevCopilot API] Worker error: ${errorText}`);

      return createErrorResponse(
        "DevCopilot backend returned an error",
        "WORKER_ERROR",
        workerResponse.status,
        { workerStatus: workerResponse.status }
      );
    }

    // ==========================================================================
    // 4. Handle Response
    // ==========================================================================

    if (wantsStream) {
      // Streaming response
      const headers = new Headers({
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...CORS_HEADERS
      });

      // Add rate limit headers
      const rateLimitHeaders = {
        "X-RateLimit-Remaining": String(rateLimitResult.remaining)
      };

      Object.entries(rateLimitHeaders).forEach(([key, value]) => {
        headers.set(key, value);
      });

      // Stream the worker response through
      return new Response(workerResponse.body, {
        status: 200,
        headers
      });
    }

    // Non-streaming response
    const workerData = (await workerResponse.json()) as Record<string, unknown>;

    const response: ChatResponse = {
      response: (workerData.response as string) || "",
      toolsUsed: workerData.toolsUsed as string[] | undefined,
      toolResults: workerData.toolResults as ChatResponse["toolResults"],
      sessionId,
      timestamp: new Date().toISOString(),
      usage: workerData.usage as ChatResponse["usage"]
    };

    const processingTime = Date.now() - startTime;
    console.log(`[DevCopilot API] Request processed in ${processingTime}ms`);

    return createSuccessResponse(response);
  } catch (error) {
    console.error("[DevCopilot API] Error:", error);

    return createErrorResponse(
      error instanceof Error ? error.message : "An unexpected error occurred",
      "INTERNAL_ERROR",
      500
    );
  }
}

// =============================================================================
// Export for Edge Runtime (Next.js 13+)
// =============================================================================

/**
 * Configure this route for Edge Runtime for best performance
 * when deployed alongside Cloudflare Workers
 */
export const runtime = "edge";

/**
 * Allow streaming responses
 */
export const dynamic = "force-dynamic";
