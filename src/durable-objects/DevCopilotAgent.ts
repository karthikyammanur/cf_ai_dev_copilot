/**
 * DevCopilotAgent - Durable Object for managing stateful AI conversations
 *
 * This Durable Object provides persistent storage for:
 * - Conversation history between user and AI assistant
 * - Project context (Worker code, error logs, resolved issues)
 * - Session management with timestamps
 *
 * State Management Strategy:
 * - Uses SQLite storage (via Durable Objects SQL API) for persistence
 * - Conversation messages are stored in a dedicated table
 * - Project context is stored as JSON in a separate table
 * - Session metadata tracks activity for cleanup/expiration
 *
 * @see https://developers.cloudflare.com/durable-objects/
 */

import { DurableObject } from "cloudflare:workers";
import type {
  ConversationMessage,
  ProjectContext,
  SessionInfo,
  DevCopilotState,
  GetHistoryOptions,
  StateOperationResult,
  ResolvedIssue,
  MessageMetadata
} from "../types";

/**
 * Generate a unique ID for messages and sessions
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Get current ISO timestamp
 */
function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * DevCopilotAgent Durable Object
 * Manages conversation state and project context for the AI development assistant
 */
export class DevCopilotAgent extends DurableObject<Env> {
  /** SQL database instance for persistent storage */
  private sql: SqlStorage;

  /** Cached session info for quick access */
  private sessionCache: SessionInfo | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;

    // Initialize database tables on first instantiation
    this.initializeDatabase();
  }

  /**
   * Initialize SQLite tables for storing conversation and project data
   * Uses IF NOT EXISTS to safely handle repeated instantiations
   */
  private initializeDatabase(): void {
    // Conversation messages table
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        metadata TEXT
      )
    `);

    // Project context table (single row, updated in place)
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS project_context (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        worker_code TEXT,
        error_logs TEXT,
        resolved_issues TEXT,
        cloudflare_services TEXT,
        project_name TEXT,
        last_updated TEXT
      )
    `);

    // Session info table (single row for this DO instance)
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS session_info (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        session_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_activity_at TEXT NOT NULL,
        message_count INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1
      )
    `);

    // Create indexes for common queries
    this.sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC)
    `);
    this.sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role)
    `);

    // Initialize session if it doesn't exist
    this.ensureSession();
  }

  /**
   * Ensure a session exists, creating one if necessary
   */
  private ensureSession(): SessionInfo {
    const existing = this.sql
      .exec(`SELECT * FROM session_info WHERE id = 1`)
      .one();

    if (existing) {
      this.sessionCache = {
        sessionId: existing.session_id as string,
        createdAt: existing.created_at as string,
        lastActivityAt: existing.last_activity_at as string,
        messageCount: existing.message_count as number,
        isActive: (existing.is_active as number) === 1
      };
      return this.sessionCache;
    }

    // Create new session
    const now = getCurrentTimestamp();
    const sessionId = generateId();

    this.sql.exec(
      `
      INSERT INTO session_info (id, session_id, created_at, last_activity_at, message_count, is_active)
      VALUES (1, ?, ?, ?, 0, 1)
    `,
      sessionId,
      now,
      now
    );

    this.sessionCache = {
      sessionId,
      createdAt: now,
      lastActivityAt: now,
      messageCount: 0,
      isActive: true
    };

    return this.sessionCache;
  }

  /**
   * Update session's last activity timestamp
   */
  private updateSessionActivity(): void {
    const now = getCurrentTimestamp();
    this.sql.exec(
      `
      UPDATE session_info SET last_activity_at = ? WHERE id = 1
    `,
      now
    );

    if (this.sessionCache) {
      this.sessionCache.lastActivityAt = now;
    }
  }

  /**
   * Increment the message count in the session
   */
  private incrementMessageCount(): void {
    this.sql.exec(`
      UPDATE session_info SET message_count = message_count + 1 WHERE id = 1
    `);

    if (this.sessionCache) {
      this.sessionCache.messageCount++;
    }
  }

  // ===========================================================================
  // PUBLIC API: Message Management
  // ===========================================================================

  /**
   * Add a new message to the conversation history
   *
   * @param role - The role of the message sender ('user', 'assistant', 'system')
   * @param content - The message content
   * @param metadata - Optional metadata for the message
   * @returns The created message with its ID and timestamp
   */
  async addMessage(
    role: "user" | "assistant" | "system",
    content: string,
    metadata?: MessageMetadata
  ): Promise<ConversationMessage> {
    const id = generateId();
    const timestamp = getCurrentTimestamp();
    const metadataJson = metadata ? JSON.stringify(metadata) : null;

    try {
      this.sql.exec(
        `
        INSERT INTO messages (id, role, content, timestamp, metadata)
        VALUES (?, ?, ?, ?, ?)
      `,
        id,
        role,
        content,
        timestamp,
        metadataJson
      );

      this.incrementMessageCount();
      this.updateSessionActivity();

      const message: ConversationMessage = {
        id,
        role,
        content,
        timestamp,
        metadata
      };

      return message;
    } catch (error) {
      console.error("Failed to add message:", error);
      throw new Error(
        `Failed to add message: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Retrieve conversation history with optional filtering
   *
   * @param options - Options for filtering and limiting results
   * @returns Array of conversation messages
   */
  async getConversationHistory(
    options?: GetHistoryOptions
  ): Promise<ConversationMessage[]> {
    try {
      let query = "SELECT * FROM messages WHERE 1=1";
      const params: (string | number)[] = [];

      // Apply filters
      if (options?.role) {
        query += " AND role = ?";
        params.push(options.role);
      }

      if (options?.after) {
        query += " AND timestamp > ?";
        params.push(options.after);
      }

      if (options?.before) {
        query += " AND timestamp < ?";
        params.push(options.before);
      }

      // Order by timestamp (newest first for limit, then reverse)
      query += " ORDER BY timestamp DESC";

      // Apply limit
      if (options?.limit && options.limit > 0) {
        query += " LIMIT ?";
        params.push(options.limit);
      }

      const cursor = this.sql.exec(query, ...params);
      const rows = cursor.toArray();

      // Parse rows into ConversationMessage objects and reverse to get chronological order
      const messages: ConversationMessage[] = rows.reverse().map((row) => ({
        id: row.id as string,
        role: row.role as "user" | "assistant" | "system",
        content: row.content as string,
        timestamp: row.timestamp as string,
        metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined
      }));

      this.updateSessionActivity();
      return messages;
    } catch (error) {
      console.error("Failed to get conversation history:", error);
      throw new Error(
        `Failed to get conversation history: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Get total message count in the conversation
   */
  async getMessageCount(): Promise<number> {
    const result = this.sql
      .exec(`SELECT COUNT(*) as count FROM messages`)
      .one();
    return (result?.count as number) ?? 0;
  }

  /**
   * Delete a specific message by ID
   */
  async deleteMessage(messageId: string): Promise<boolean> {
    try {
      this.sql.exec(`DELETE FROM messages WHERE id = ?`, messageId);
      return true;
    } catch (error) {
      console.error("Failed to delete message:", error);
      return false;
    }
  }

  // ===========================================================================
  // PUBLIC API: Project Context Management
  // ===========================================================================

  /**
   * Update the project context with new information
   * Merges with existing context (doesn't overwrite undefined fields)
   *
   * @param context - Partial project context to update
   */
  async updateProjectContext(
    context: Partial<ProjectContext>
  ): Promise<StateOperationResult> {
    try {
      // Get existing context first
      const existing = await this.getProjectContext();

      // Merge contexts
      const merged: ProjectContext = {
        ...existing,
        ...context,
        lastUpdated: getCurrentTimestamp()
      };

      // Handle array merging for error logs and resolved issues
      if (context.errorLogs && existing.errorLogs) {
        merged.errorLogs = [...existing.errorLogs, ...context.errorLogs];
      }
      if (context.resolvedIssues && existing.resolvedIssues) {
        merged.resolvedIssues = [
          ...existing.resolvedIssues,
          ...context.resolvedIssues
        ];
      }
      if (context.cloudflareServices && existing.cloudflareServices) {
        // Deduplicate services
        merged.cloudflareServices = [
          ...new Set([
            ...existing.cloudflareServices,
            ...context.cloudflareServices
          ])
        ];
      }

      // Upsert the context
      this.sql.exec(
        `
        INSERT INTO project_context (id, worker_code, error_logs, resolved_issues, cloudflare_services, project_name, last_updated)
        VALUES (1, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          worker_code = excluded.worker_code,
          error_logs = excluded.error_logs,
          resolved_issues = excluded.resolved_issues,
          cloudflare_services = excluded.cloudflare_services,
          project_name = excluded.project_name,
          last_updated = excluded.last_updated
      `,
        merged.workerCode ?? null,
        merged.errorLogs ? JSON.stringify(merged.errorLogs) : null,
        merged.resolvedIssues ? JSON.stringify(merged.resolvedIssues) : null,
        merged.cloudflareServices
          ? JSON.stringify(merged.cloudflareServices)
          : null,
        merged.projectName ?? null,
        merged.lastUpdated ?? null
      );

      this.updateSessionActivity();

      return { success: true, data: merged };
    } catch (error) {
      console.error("Failed to update project context:", error);
      return {
        success: false,
        error: `Failed to update project context: ${error instanceof Error ? error.message : "Unknown error"}`
      };
    }
  }

  /**
   * Get the current project context
   *
   * @returns The current project context or empty object if none exists
   */
  async getProjectContext(): Promise<ProjectContext> {
    try {
      const row = this.sql
        .exec(`SELECT * FROM project_context WHERE id = 1`)
        .one();

      if (!row) {
        return {};
      }

      return {
        workerCode: row.worker_code as string | undefined,
        errorLogs: row.error_logs
          ? JSON.parse(row.error_logs as string)
          : undefined,
        resolvedIssues: row.resolved_issues
          ? JSON.parse(row.resolved_issues as string)
          : undefined,
        cloudflareServices: row.cloudflare_services
          ? JSON.parse(row.cloudflare_services as string)
          : undefined,
        projectName: row.project_name as string | undefined,
        lastUpdated: row.last_updated as string | undefined
      };
    } catch (error) {
      console.error("Failed to get project context:", error);
      return {};
    }
  }

  /**
   * Add a resolved issue to the project context
   *
   * @param issue - Description of the issue
   * @param solution - The solution that was applied
   * @param errorCodes - Optional error codes related to the issue
   * @param affectedFiles - Optional list of affected files
   */
  async addResolvedIssue(
    issue: string,
    solution: string,
    errorCodes?: string[],
    affectedFiles?: string[]
  ): Promise<StateOperationResult> {
    const resolvedIssue: ResolvedIssue = {
      timestamp: getCurrentTimestamp(),
      issue,
      solution,
      errorCodes,
      affectedFiles
    };

    return this.updateProjectContext({
      resolvedIssues: [resolvedIssue]
    });
  }

  /**
   * Add error logs to the project context
   *
   * @param logs - Array of error log strings to add
   */
  async addErrorLogs(logs: string[]): Promise<StateOperationResult> {
    return this.updateProjectContext({
      errorLogs: logs
    });
  }

  /**
   * Set the current Worker code being analyzed
   *
   * @param code - The Worker source code
   * @param projectName - Optional project name
   */
  async setWorkerCode(
    code: string,
    projectName?: string
  ): Promise<StateOperationResult> {
    return this.updateProjectContext({
      workerCode: code,
      projectName
    });
  }

  // ===========================================================================
  // PUBLIC API: Session Management
  // ===========================================================================

  /**
   * Get current session information
   */
  async getSessionInfo(): Promise<SessionInfo> {
    return this.ensureSession();
  }

  /**
   * Clear the current session (deletes all messages and resets context)
   * Creates a new session after clearing
   */
  async clearSession(): Promise<StateOperationResult> {
    try {
      // Delete all messages
      this.sql.exec(`DELETE FROM messages`);

      // Clear project context
      this.sql.exec(`DELETE FROM project_context`);

      // Reset session info
      this.sql.exec(`DELETE FROM session_info`);

      // Clear cache
      this.sessionCache = null;

      // Create new session
      this.ensureSession();

      return { success: true };
    } catch (error) {
      console.error("Failed to clear session:", error);
      return {
        success: false,
        error: `Failed to clear session: ${error instanceof Error ? error.message : "Unknown error"}`
      };
    }
  }

  /**
   * Mark the session as inactive (for cleanup purposes)
   */
  async deactivateSession(): Promise<void> {
    this.sql.exec(`UPDATE session_info SET is_active = 0 WHERE id = 1`);
    if (this.sessionCache) {
      this.sessionCache.isActive = false;
    }
  }

  /**
   * Get the complete state of the Durable Object
   * Useful for debugging and backup purposes
   */
  async getFullState(): Promise<DevCopilotState> {
    const session = await this.getSessionInfo();
    const messages = await this.getConversationHistory();
    const projectContext = await this.getProjectContext();

    return {
      session,
      messages,
      projectContext
    };
  }

  // ===========================================================================
  // HTTP Request Handler
  // ===========================================================================

  /**
   * Handle HTTP requests to the Durable Object
   * Provides a REST-like API for state management
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      // Route: POST /messages - Add a message
      if (path === "/messages" && method === "POST") {
        const body = (await request.json()) as {
          role: string;
          content: string;
          metadata?: MessageMetadata;
        };
        const message = await this.addMessage(
          body.role as "user" | "assistant" | "system",
          body.content,
          body.metadata
        );
        return Response.json(message, { status: 201 });
      }

      // Route: GET /messages - Get conversation history
      if (path === "/messages" && method === "GET") {
        const limit = url.searchParams.get("limit");
        const role = url.searchParams.get("role") as
          | "user"
          | "assistant"
          | "system"
          | null;

        const messages = await this.getConversationHistory({
          limit: limit ? parseInt(limit, 10) : undefined,
          role: role ?? undefined
        });
        return Response.json(messages);
      }

      // Route: GET /context - Get project context
      if (path === "/context" && method === "GET") {
        const context = await this.getProjectContext();
        return Response.json(context);
      }

      // Route: PUT /context - Update project context
      if (path === "/context" && method === "PUT") {
        const body = (await request.json()) as Partial<ProjectContext>;
        const result = await this.updateProjectContext(body);
        return Response.json(result);
      }

      // Route: GET /session - Get session info
      if (path === "/session" && method === "GET") {
        const session = await this.getSessionInfo();
        return Response.json(session);
      }

      // Route: DELETE /session - Clear session
      if (path === "/session" && method === "DELETE") {
        const result = await this.clearSession();
        return Response.json(result);
      }

      // Route: GET /state - Get full state (for debugging)
      if (path === "/state" && method === "GET") {
        const state = await this.getFullState();
        return Response.json(state);
      }

      return new Response("Not Found", { status: 404 });
    } catch (error) {
      console.error("Durable Object request error:", error);
      return Response.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        { status: 500 }
      );
    }
  }
}
