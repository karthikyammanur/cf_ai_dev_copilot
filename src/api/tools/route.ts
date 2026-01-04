/**
 * DevCopilot Tools API Route
 *
 * Direct access to DevCopilot tools without the chat interface.
 * Useful for programmatic access or integrations.
 *
 * Endpoints:
 * - POST /api/tools/analyze-error
 * - POST /api/tools/review-code
 * - POST /api/tools/search-docs
 *
 * @module api/tools/route
 */

import type { ToolRequest, ErrorResponse } from "../types";
import { validateToolRequest, sanitizeInput } from "../types";
import {
  toolRateLimiter,
  getClientIdentifier,
  createRateLimitResponse
} from "../rate-limiter";

// =============================================================================
// Configuration
// =============================================================================

const WORKER_URL = process.env.DEVCOPILOT_WORKER_URL || "http://localhost:8787";
const API_KEY = process.env.DEVCOPILOT_API_KEY;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":
    process.env.NODE_ENV === "development"
      ? "*"
      : process.env.ALLOWED_ORIGIN || "https://your-domain.com",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400"
};

// Tool name mapping
const TOOL_ENDPOINTS: Record<string, string> = {
  analyzeError: "/api/tools/analyze-error",
  reviewCode: "/api/tools/review-code",
  searchDocs: "/api/tools/search-docs"
};

// =============================================================================
// Helper Functions
// =============================================================================

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

async function forwardToWorkerTool(
  tool: string,
  input: Record<string, unknown>
): Promise<Response> {
  const endpoint = TOOL_ENDPOINTS[tool];
  if (!endpoint) {
    throw new Error(`Unknown tool: ${tool}`);
  }

  const workerUrl = new URL(endpoint, WORKER_URL);

  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (API_KEY) {
    headers.Authorization = `Bearer ${API_KEY}`;
  }

  return fetch(workerUrl.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify(input)
  });
}

// =============================================================================
// Route Handlers
// =============================================================================

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}

export async function GET(): Promise<Response> {
  return new Response(
    JSON.stringify({
      status: "ok",
      service: "devcopilot-tools-api",
      availableTools: Object.keys(TOOL_ENDPOINTS),
      usage: {
        analyzeError: {
          method: "POST",
          body: { tool: "analyzeError", input: { errorLog: "string" } }
        },
        reviewCode: {
          method: "POST",
          body: { tool: "reviewCode", input: { code: "string" } }
        },
        searchDocs: {
          method: "POST",
          body: {
            tool: "searchDocs",
            input: { query: "string", maxResults: "number?" }
          }
        }
      },
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
 * Handle POST request for tool invocation
 *
 * Request body:
 * {
 *   tool: 'analyzeError' | 'reviewCode' | 'searchDocs',
 *   input: {
 *     errorLog?: string,  // For analyzeError
 *     code?: string,      // For reviewCode
 *     query?: string,     // For searchDocs
 *     maxResults?: number // For searchDocs
 *   }
 * }
 */
export async function POST(request: Request): Promise<Response> {
  const startTime = Date.now();

  // Rate limiting
  const clientId = getClientIdentifier(request);
  const rateLimitResult = toolRateLimiter.check(clientId);

  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult);
  }

  // Parse request
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createErrorResponse("Invalid JSON", "INVALID_JSON", 400);
  }

  // Validate
  const validation = validateToolRequest(body);
  if (!validation.valid) {
    return createErrorResponse(
      `Validation failed: ${validation.errors.join(", ")}`,
      "VALIDATION_ERROR",
      400,
      { errors: validation.errors }
    );
  }

  const toolRequest = body as ToolRequest;

  // Prepare input based on tool
  let toolInput: Record<string, unknown> = {};

  switch (toolRequest.tool) {
    case "analyzeError":
      if (!toolRequest.input.errorLog) {
        return createErrorResponse(
          "errorLog is required",
          "MISSING_INPUT",
          400
        );
      }
      toolInput = { errorLog: sanitizeInput(toolRequest.input.errorLog) };
      break;

    case "reviewCode":
      if (!toolRequest.input.code) {
        return createErrorResponse("code is required", "MISSING_INPUT", 400);
      }
      toolInput = { code: toolRequest.input.code }; // Don't sanitize code
      break;

    case "searchDocs":
      if (!toolRequest.input.query) {
        return createErrorResponse("query is required", "MISSING_INPUT", 400);
      }
      toolInput = {
        query: sanitizeInput(toolRequest.input.query),
        maxResults: toolRequest.input.maxResults || 3
      };
      break;
  }

  try {
    console.log(`[DevCopilot Tools API] Invoking tool: ${toolRequest.tool}`);

    const workerResponse = await forwardToWorkerTool(
      toolRequest.tool,
      toolInput
    );

    if (!workerResponse.ok) {
      const errorText = await workerResponse.text();
      console.error(`[DevCopilot Tools API] Worker error: ${errorText}`);

      return createErrorResponse(
        "Tool execution failed",
        "TOOL_ERROR",
        workerResponse.status
      );
    }

    const result = await workerResponse.json();
    const processingTime = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        success: true,
        tool: toolRequest.tool,
        result,
        processingTime,
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
  } catch (error) {
    console.error("[DevCopilot Tools API] Error:", error);

    return createErrorResponse(
      error instanceof Error ? error.message : "Tool execution failed",
      "INTERNAL_ERROR",
      500
    );
  }
}

export const runtime = "edge";
export const dynamic = "force-dynamic";
