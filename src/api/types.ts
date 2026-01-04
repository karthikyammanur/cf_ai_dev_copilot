/**
 * DevCopilot API Types
 * 
 * Type definitions for the Next.js API route that communicates
 * with the Cloudflare Worker backend.
 * 
 * @module api/types
 */

// =============================================================================
// Request Types
// =============================================================================

/**
 * Project context for the DevCopilot session
 */
export interface ProjectContext {
  /** Current worker code being analyzed */
  workerCode?: string;
  /** Recent error logs */
  errorLogs?: string[];
  /** Cloudflare services in use */
  cloudflareServices?: string[];
  /** Project name */
  projectName?: string;
  /** Wrangler config (parsed) */
  wranglerConfig?: Record<string, unknown>;
}

/**
 * Chat request body
 */
export interface ChatRequest {
  /** User's message */
  message: string;
  /** Session ID for conversation continuity */
  sessionId?: string;
  /** Project context for better assistance */
  projectContext?: ProjectContext;
  /** Optional: specific tool to invoke */
  tool?: 'analyzeError' | 'reviewCode' | 'searchDocs';
}

/**
 * Direct tool invocation request
 */
export interface ToolRequest {
  /** Tool to invoke */
  tool: 'analyzeError' | 'reviewCode' | 'searchDocs';
  /** Tool-specific input */
  input: {
    /** For analyzeError: the error log text */
    errorLog?: string;
    /** For reviewCode: the code to review */
    code?: string;
    /** For searchDocs: the search query */
    query?: string;
    /** For searchDocs: max results */
    maxResults?: number;
  };
  /** Session ID (optional) */
  sessionId?: string;
}

// =============================================================================
// Response Types
// =============================================================================

/**
 * Tool invocation result
 */
export interface ToolResult {
  /** Tool that was invoked */
  toolName: string;
  /** Tool output */
  output: unknown;
  /** Execution time in ms */
  executionTime?: number;
}

/**
 * Chat response body
 */
export interface ChatResponse {
  /** AI response text */
  response: string;
  /** Tools that were used during the response */
  toolsUsed?: string[];
  /** Tool results if any */
  toolResults?: ToolResult[];
  /** Session ID for continuity */
  sessionId: string;
  /** Response timestamp */
  timestamp: string;
  /** Token usage (if available) */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/**
 * Streaming chunk format
 */
export interface StreamChunk {
  /** Chunk type */
  type: 'text' | 'tool-start' | 'tool-result' | 'error' | 'done';
  /** Content based on type */
  content?: string;
  /** Tool name (for tool events) */
  toolName?: string;
  /** Tool result (for tool-result events) */
  toolResult?: unknown;
  /** Error message (for error events) */
  error?: string;
}

/**
 * Error response
 */
export interface ErrorResponse {
  /** Error indicator */
  error: true;
  /** Error message */
  message: string;
  /** Error code for programmatic handling */
  code: string;
  /** HTTP status code */
  status: number;
  /** Additional details */
  details?: Record<string, unknown>;
}

// =============================================================================
// Session Types
// =============================================================================

/**
 * Session info stored in the backend
 */
export interface SessionInfo {
  /** Unique session ID */
  sessionId: string;
  /** Creation timestamp */
  createdAt: string;
  /** Last activity timestamp */
  lastActivityAt: string;
  /** Message count in session */
  messageCount: number;
  /** Is session active */
  isActive: boolean;
}

// =============================================================================
// Rate Limiting Types
// =============================================================================

/**
 * Rate limit info returned in headers
 */
export interface RateLimitInfo {
  /** Requests remaining in window */
  remaining: number;
  /** Total requests allowed per window */
  limit: number;
  /** Window reset timestamp */
  resetAt: string;
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate chat request
 */
export function validateChatRequest(body: unknown): ValidationResult {
  const errors: string[] = [];
  
  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Request body must be an object'] };
  }
  
  const request = body as Record<string, unknown>;
  
  // Message validation
  if (!request.message) {
    errors.push('Message is required');
  } else if (typeof request.message !== 'string') {
    errors.push('Message must be a string');
  } else if (request.message.length === 0) {
    errors.push('Message cannot be empty');
  } else if (request.message.length > 50000) {
    errors.push('Message exceeds maximum length (50,000 characters)');
  }
  
  // SessionId validation (optional)
  if (request.sessionId !== undefined) {
    if (typeof request.sessionId !== 'string') {
      errors.push('SessionId must be a string');
    } else if (request.sessionId.length > 100) {
      errors.push('SessionId exceeds maximum length (100 characters)');
    }
  }
  
  // ProjectContext validation (optional)
  if (request.projectContext !== undefined) {
    if (typeof request.projectContext !== 'object') {
      errors.push('ProjectContext must be an object');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate tool request
 */
export function validateToolRequest(body: unknown): ValidationResult {
  const errors: string[] = [];
  
  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Request body must be an object'] };
  }
  
  const request = body as Record<string, unknown>;
  
  // Tool validation
  const validTools = ['analyzeError', 'reviewCode', 'searchDocs'];
  if (!request.tool) {
    errors.push('Tool is required');
  } else if (!validTools.includes(request.tool as string)) {
    errors.push(`Invalid tool. Must be one of: ${validTools.join(', ')}`);
  }
  
  // Input validation
  if (!request.input) {
    errors.push('Input is required');
  } else if (typeof request.input !== 'object') {
    errors.push('Input must be an object');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Sanitize user input
 */
export function sanitizeInput(input: string): string {
  // Remove potential XSS vectors while preserving code
  // We're lenient because code often contains special characters
  return input
    .trim()
    // Remove null bytes
    .replace(/\0/g, '')
    // Limit consecutive newlines
    .replace(/\n{5,}/g, '\n\n\n\n');
}

/**
 * Generate a new session ID
 */
export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `session_${timestamp}_${randomPart}`;
}
