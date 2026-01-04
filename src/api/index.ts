/**
 * DevCopilot API Routes Index
 *
 * This module exports all API route handlers for the DevCopilot frontend.
 * These routes are designed for Next.js App Router but can be adapted
 * for other frameworks.
 *
 * Route Structure:
 * - /api/chat     - Chat with the AI assistant (streaming)
 * - /api/tools    - Direct tool invocation
 * - /api/session  - Session management
 *
 * Environment Variables:
 * - DEVCOPILOT_WORKER_URL: URL of the Cloudflare Worker (default: http://localhost:8787)
 * - DEVCOPILOT_API_KEY: Optional API key for Worker authentication
 * - ALLOWED_ORIGIN: Allowed CORS origin for production
 * - NODE_ENV: Environment mode (development/production)
 *
 * @module api/index
 */

// Re-export types
export type {
  ChatRequest,
  ChatResponse,
  ToolRequest,
  ErrorResponse,
  StreamChunk,
  SessionInfo
} from "./types";

// Re-export validation utilities
export {
  validateChatRequest,
  validateToolRequest,
  sanitizeInput,
  generateSessionId
} from "./types";

// Re-export rate limiter
export {
  RateLimiter,
  chatRateLimiter,
  toolRateLimiter,
  getClientIdentifier,
  createRateLimitResponse
} from "./rate-limiter";

// Route handler imports for reference
// Note: In Next.js App Router, these are automatically discovered
// by placing them in the correct directory structure:
//
// app/
//   api/
//     chat/
//       route.ts    -> exports { GET, POST, OPTIONS }
//     tools/
//       route.ts    -> exports { GET, POST, OPTIONS }
//     session/
//       route.ts    -> exports { GET, POST, DELETE, OPTIONS }

/**
 * API Configuration
 *
 * Use these constants when setting up the frontend API client.
 */
export const API_CONFIG = {
  endpoints: {
    chat: "/api/chat",
    tools: "/api/tools",
    session: "/api/session"
  },

  tools: {
    analyzeError: "analyzeError",
    reviewCode: "reviewCode",
    searchDocs: "searchDocs"
  },

  // Rate limits (requests per minute)
  rateLimits: {
    chat: 30,
    tools: 60
  },

  // Default streaming configuration
  streaming: {
    enabled: true,
    chunkSize: 1024
  }
};

/**
 * Create API headers for authenticated requests
 */
export function createApiHeaders(sessionId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (sessionId) {
    headers["X-Session-ID"] = sessionId;
  }

  return headers;
}

/**
 * Helper to handle streaming responses in the frontend
 */
export async function* streamResponse(
  response: Response
): AsyncGenerator<StreamChunk> {
  if (!response.body) {
    throw new Error("Response has no body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);

          if (data === "[DONE]") {
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

/**
 * Frontend API Client
 *
 * A simple client for interacting with the DevCopilot API.
 * Can be used in React components or other frontend code.
 */
export class DevCopilotClient {
  private baseUrl: string;
  private sessionId?: string;

  constructor(baseUrl: string = "") {
    this.baseUrl = baseUrl;
  }

  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  getSessionId(): string | undefined {
    return this.sessionId;
  }

  /**
   * Send a chat message (streaming)
   */
  async chat(message: string): Promise<Response> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: createApiHeaders(this.sessionId),
      body: JSON.stringify({
        message,
        sessionId: this.sessionId,
        stream: true
      })
    });

    if (!response.ok) {
      throw new Error(`Chat request failed: ${response.status}`);
    }

    return response;
  }

  /**
   * Send a chat message and get a complete response
   */
  async chatSync(message: string): Promise<ChatResponse> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: createApiHeaders(this.sessionId),
      body: JSON.stringify({
        message,
        sessionId: this.sessionId,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Chat request failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Analyze an error log
   */
  async analyzeError(errorLog: string): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}/api/tools`, {
      method: "POST",
      headers: createApiHeaders(this.sessionId),
      body: JSON.stringify({
        tool: "analyzeError",
        input: { errorLog }
      })
    });

    if (!response.ok) {
      throw new Error(`Tool request failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Review Worker code
   */
  async reviewCode(code: string): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}/api/tools`, {
      method: "POST",
      headers: createApiHeaders(this.sessionId),
      body: JSON.stringify({
        tool: "reviewCode",
        input: { code }
      })
    });

    if (!response.ok) {
      throw new Error(`Tool request failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Search Cloudflare documentation
   */
  async searchDocs(query: string, maxResults?: number): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}/api/tools`, {
      method: "POST",
      headers: createApiHeaders(this.sessionId),
      body: JSON.stringify({
        tool: "searchDocs",
        input: { query, maxResults }
      })
    });

    if (!response.ok) {
      throw new Error(`Tool request failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get current session info
   */
  async getSession(): Promise<SessionInfo> {
    const response = await fetch(`${this.baseUrl}/api/session`, {
      method: "GET",
      headers: createApiHeaders(this.sessionId)
    });

    if (!response.ok) {
      throw new Error(`Session request failed: ${response.status}`);
    }

    const session = (await response.json()) as SessionInfo;
    this.sessionId = session.sessionId;
    return session;
  }

  /**
   * Update session context
   */
  async updateSession(context: Record<string, unknown>): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}/api/session`, {
      method: "POST",
      headers: createApiHeaders(this.sessionId),
      body: JSON.stringify(context)
    });

    if (!response.ok) {
      throw new Error(`Session update failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Clear session
   */
  async clearSession(): Promise<void> {
    await fetch(`${this.baseUrl}/api/session`, {
      method: "DELETE",
      headers: createApiHeaders(this.sessionId)
    });

    this.sessionId = undefined;
  }
}

// Default client instance
export const devCopilotClient = new DevCopilotClient();

// Import types from ChatResponse
import type { ChatResponse, StreamChunk, SessionInfo } from "./types";
