/**
 * cf_ai_dev_copilot - Main Worker Entry Point
 * 
 * This is the main Worker file that integrates all tools with Llama 3.3
 * and handles the agent orchestration for the DevCopilot assistant.
 * 
 * @module server
 */

import { routeAgentRequest, type Schedule } from "agents";
import { getSchedulePrompt } from "agents/schedule";
import { AIChatAgent } from "@cloudflare/ai-chat";
import {
  generateId,
  streamText,
  type StreamTextOnFinishCallback,
  stepCountIs,
  createUIMessageStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  type ToolSet,
  type UIMessage
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { processToolCalls, cleanupMessages } from "./utils";
import { tools, executions } from "./tools";

// Export the DevCopilotAgent Durable Object for state management
export { DevCopilotAgent } from "./durable-objects/DevCopilotAgent";

// =============================================================================
// System Prompt - Defines the DevCopilot personality and capabilities
// =============================================================================

const DEVCOPILOT_SYSTEM_PROMPT = `You are DevCopilot, an expert AI assistant specialized in Cloudflare Workers development. You help developers debug errors, review code, and find documentation.

## Your Capabilities
You have access to three powerful tools:

1. **analyzeCloudflareError** - Analyzes error logs to identify root causes and provide debugging guidance
   - Use when: User shares error messages, stack traces, or mentions issues with their Worker
   - Provides: Error type, severity, root cause, suggested fixes, code examples

2. **reviewWorkerCode** - Performs comprehensive code review for performance, security, and best practices
   - Use when: User shares code and wants review, optimization tips, or security checks
   - Provides: Score (0-100), categorized findings, specific recommendations with fixed code

3. **searchCloudflareDocs** - Searches Cloudflare documentation for relevant guides and examples
   - Use when: User asks "how to" questions, needs documentation, or asks about Cloudflare features
   - Provides: Relevant docs with explanations, code examples, and links

## Your Behavior
- **Be proactive**: When user provides code, automatically run code review
- **Be proactive**: When user shares errors, automatically analyze them
- **Be helpful**: Suggest documentation when users seem confused
- **Be concise**: Give clear, actionable answers without unnecessary verbosity
- **Be practical**: Always provide code examples when explaining concepts
- **Be thorough**: Use multiple tools when appropriate (e.g., review code AND search docs)

## Response Style
- Use markdown formatting for readability
- Include code blocks with proper syntax highlighting
- Organize longer responses with headers
- Link to official Cloudflare docs when relevant
- Explain the "why" behind recommendations

## Context Awareness
- Remember previous messages in the conversation
- Build on earlier analysis when user asks follow-up questions
- Reference specific issues found in previous tool calls

${getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.`;

// =============================================================================
// Workers AI Model Configuration
// =============================================================================

/**
 * Creates the Workers AI model instance for Llama 3.3
 * Uses the workers-ai-provider for AI SDK compatibility
 */
function createModel(env: Env) {
  const workersAI = createWorkersAI({ binding: env.AI });
  
  // Use the model specified in environment or default to Llama 3.3 70B
  const modelId = env.AI_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  
  return workersAI(modelId);
}

// =============================================================================
// Chat Agent Implementation
// =============================================================================

/**
 * DevCopilot Chat Agent
 * 
 * Handles real-time AI chat interactions with tool execution and streaming.
 * Extends AIChatAgent for WebSocket support and message persistence.
 */
export class Chat extends AIChatAgent<Env> {
  /**
   * Handles incoming chat messages and manages the response stream
   * 
   * Flow:
   * 1. Clean up any incomplete tool calls from previous messages
   * 2. Process pending tool confirmations (human-in-the-loop)
   * 3. Stream response from Llama 3.3 with tool access
   * 4. Handle tool calls automatically when LLM requests them
   * 5. Persist conversation to Durable Object
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal }
  ) {
    // Create model instance with current environment bindings
    const model = createModel(this.env);
    
    // Collect all tools, including any MCP tools
    const allTools = {
      ...tools,
      ...this.mcp.getAITools()
    };

    // Get or create Durable Object for state persistence
    const copilotId = this.env.COPILOT_AGENT.idFromName(this.name || "default");
    const copilotStub = this.env.COPILOT_AGENT.get(copilotId);

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // Clean up incomplete tool calls to prevent API errors
        const cleanedMessages = cleanupMessages(this.messages);

        // Process any pending tool calls from previous messages
        // This handles human-in-the-loop confirmations for tools
        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: allTools,
          executions
        });

        // Get max tokens from environment (default: 4096)
        const maxTokens = parseInt(this.env.MAX_TOKENS || "4096", 10);

        try {
          const result = streamText({
            system: DEVCOPILOT_SYSTEM_PROMPT,
            messages: await convertToModelMessages(processedMessages),
            model,
            tools: allTools,
            maxTokens,
            temperature: 0.7,
            // Limit tool call depth to prevent infinite loops
            stopWhen: stepCountIs(10),
            // Enhanced finish callback with state persistence
            onFinish: async (event) => {
              // Persist the conversation to Durable Object
              await this.persistConversation(copilotStub, event);
              
              // Call the original onFinish callback
              (onFinish as unknown as StreamTextOnFinishCallback<typeof allTools>)(event);
            },
            // Handle streaming chunks for real-time updates
            onStepFinish: async (step) => {
              // Log tool usage for debugging
              if (step.toolCalls && step.toolCalls.length > 0) {
                console.log(
                  `[DevCopilot] Tool calls:`,
                  step.toolCalls.map((tc) => tc.toolName)
                );
              }
            },
            abortSignal: options?.abortSignal
          });

          writer.merge(result.toUIMessageStream());
        } catch (error) {
          console.error("[DevCopilot] Stream error:", error);
          
          // Send error message to client
          writer.write({
            type: "error",
            value: error instanceof Error ? error.message : "An unexpected error occurred"
          });
          
          throw error;
        }
      }
    });

    return createUIMessageStreamResponse({ stream });
  }

  /**
   * Persists conversation state to the Durable Object
   * Stores messages, tool results, and metadata for context continuity
   */
  private async persistConversation(
    copilotStub: DurableObjectStub,
    // biome-ignore lint/suspicious/noExplicitAny: Event type varies
    event: any
  ): Promise<void> {
    try {
      // Get the last assistant message
      const lastMessage = this.messages[this.messages.length - 1];
      
      if (lastMessage && lastMessage.role === "assistant") {
        await copilotStub.fetch(new Request("http://do/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: "assistant",
            content: this.extractTextContent(lastMessage),
            metadata: {
              toolCalls: event.toolCalls?.map((tc: { toolName: string }) => tc.toolName) || [],
              finishReason: event.finishReason,
              usage: event.usage
            }
          })
        }));
      }
      
      // Also persist the user message if it's new
      const userMessage = this.messages.find(
        (m, i) => m.role === "user" && i === this.messages.length - 2
      );
      
      if (userMessage) {
        await copilotStub.fetch(new Request("http://do/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: "user",
            content: this.extractTextContent(userMessage)
          })
        }));
      }
    } catch (error) {
      console.error("[DevCopilot] Failed to persist conversation:", error);
      // Don't throw - persistence failure shouldn't break the chat
    }
  }

  /**
   * Extracts text content from a UIMessage
   */
  private extractTextContent(message: UIMessage): string {
    if (!message.parts) return "";
    
    return message.parts
      .filter((part) => part.type === "text")
      .map((part) => (part as { type: "text"; text: string }).text)
      .join("\n");
  }

  /**
   * Executes a scheduled task
   * Called by the scheduler when a task is due
   */
  async executeTask(description: string, _task: Schedule<string>) {
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        parts: [
          {
            type: "text",
            text: `Running scheduled task: ${description}`
          }
        ],
        metadata: {
          createdAt: new Date()
        }
      }
    ]);
  }
}

// =============================================================================
// API Routes for Direct Tool Access
// =============================================================================

/**
 * Handles direct API calls to tools without the chat interface
 * Useful for programmatic access or testing
 */
async function handleToolAPI(
  request: Request,
  env: Env
): Promise<Response | null> {
  const url = new URL(request.url);
  
  // Only handle POST requests to /api/tools/*
  if (!url.pathname.startsWith("/api/tools/") || request.method !== "POST") {
    return null;
  }

  const toolName = url.pathname.replace("/api/tools/", "");
  
  try {
    const body = await request.json();
    
    switch (toolName) {
      case "analyze-error": {
        const { analyzeCloudflareErrorFn } = await import("./tools/analyzeCloudflareError");
        const result = analyzeCloudflareErrorFn(body.errorLog);
        return Response.json(result);
      }
      
      case "review-code": {
        const { reviewWorkerCodeFn } = await import("./tools/reviewWorkerCode");
        const result = reviewWorkerCodeFn(body.code);
        return Response.json(result);
      }
      
      case "search-docs": {
        const { searchDocumentationFn } = await import("./tools/searchCloudflareDocs");
        const result = searchDocumentationFn(body.query, body.maxResults);
        return Response.json(result);
      }
      
      default:
        return Response.json(
          { error: `Unknown tool: ${toolName}` },
          { status: 404 }
        );
    }
  } catch (error) {
    console.error(`[DevCopilot] Tool API error (${toolName}):`, error);
    return Response.json(
      { 
        error: "Tool execution failed",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

/**
 * Handles Durable Object state API
 * Provides access to conversation history and project context
 */
async function handleStateAPI(
  request: Request,
  env: Env
): Promise<Response | null> {
  const url = new URL(request.url);
  
  // Only handle /api/state/* routes
  if (!url.pathname.startsWith("/api/state/")) {
    return null;
  }

  const sessionId = url.searchParams.get("session") || "default";
  const copilotId = env.COPILOT_AGENT.idFromName(sessionId);
  const copilotStub = env.COPILOT_AGENT.get(copilotId);

  const route = url.pathname.replace("/api/state/", "");
  
  switch (route) {
    case "messages":
      return copilotStub.fetch(new Request("http://do/messages", {
        method: request.method,
        headers: request.headers,
        body: request.method !== "GET" ? request.body : undefined
      }));
    
    case "context":
      return copilotStub.fetch(new Request("http://do/context", {
        method: request.method,
        headers: request.headers,
        body: request.method !== "GET" ? request.body : undefined
      }));
    
    case "session":
      return copilotStub.fetch(new Request("http://do/session", {
        method: request.method
      }));
    
    case "full":
      return copilotStub.fetch(new Request("http://do/state", {
        method: "GET"
      }));
    
    default:
      return Response.json(
        { error: `Unknown state route: ${route}` },
        { status: 404 }
      );
  }
}

// =============================================================================
// Health Check & Status
// =============================================================================

/**
 * Returns health and configuration status
 */
function handleHealthCheck(env: Env): Response {
  return Response.json({
    status: "ok",
    service: env.APP_NAME || "cf_ai_dev_copilot",
    model: env.AI_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    features: {
      workersAI: true,
      durableObjects: true,
      kvCache: !!env.CACHE,
      tools: ["analyzeCloudflareError", "reviewWorkerCode", "searchCloudflareDocs"]
    },
    timestamp: new Date().toISOString()
  });
}

// =============================================================================
// Worker Entry Point
// =============================================================================

/**
 * Main Worker entry point
 * Routes incoming requests to the appropriate handler
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === "/health" || url.pathname === "/api/health") {
      return handleHealthCheck(env);
    }

    // Legacy OpenAI key check (for compatibility)
    if (url.pathname === "/check-open-ai-key") {
      return Response.json({
        success: true,
        message: "DevCopilot uses Workers AI - no OpenAI key required"
      });
    }

    // Direct tool API access
    const toolResponse = await handleToolAPI(request, env);
    if (toolResponse) return toolResponse;

    // State management API
    const stateResponse = await handleStateAPI(request, env);
    if (stateResponse) return stateResponse;

    // Route the request to our agent or return 404 if not found
    const agentResponse = await routeAgentRequest(request, env);
    if (agentResponse) return agentResponse;

    // 404 fallback
    return Response.json(
      { 
        error: "Not found",
        availableEndpoints: [
          "/health",
          "/api/tools/analyze-error",
          "/api/tools/review-code", 
          "/api/tools/search-docs",
          "/api/state/messages",
          "/api/state/context",
          "/api/state/session",
          "/api/state/full"
        ]
      },
      { status: 404 }
    );
  }
} satisfies ExportedHandler<Env>;
