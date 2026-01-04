/**
 * DevCopilot Session API Route
 * 
 * Manage conversation sessions with the DevCopilot Worker.
 * Provides session state retrieval, history management, and context updates.
 * 
 * Endpoints:
 * - GET /api/session - Get current session info
 * - POST /api/session - Create or update session
 * - DELETE /api/session - Clear session
 * 
 * @module api/session/route
 */

import type { SessionInfo, ErrorResponse } from '../types';
import { generateSessionId } from '../types';

// =============================================================================
// Configuration
// =============================================================================

const WORKER_URL = process.env.DEVCOPILOT_WORKER_URL || 'http://localhost:8787';
const API_KEY = process.env.DEVCOPILOT_API_KEY;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.NODE_ENV === 'development' 
    ? '*' 
    : (process.env.ALLOWED_ORIGIN || 'https://your-domain.com'),
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-ID',
  'Access-Control-Max-Age': '86400',
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
    details,
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

function getSessionId(request: Request): string | null {
  // Check header first, then cookie
  const headerSessionId = request.headers.get('X-Session-ID');
  if (headerSessionId) {
    return headerSessionId;
  }

  const cookieHeader = request.headers.get('Cookie');
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map(c => c.trim());
    const sessionCookie = cookies.find(c => c.startsWith('devcopilot_session='));
    if (sessionCookie) {
      return sessionCookie.split('=')[1];
    }
  }

  return null;
}

async function forwardToWorkerSession(
  method: string,
  sessionId: string,
  body?: unknown
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Session-ID': sessionId,
  };

  if (API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`;
  }

  const options: RequestInit = {
    method,
    headers,
  };

  if (body && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(body);
  }

  return fetch(`${WORKER_URL}/api/state/session`, options);
}

// =============================================================================
// Route Handlers
// =============================================================================

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

/**
 * GET /api/session
 * 
 * Get current session information including:
 * - Session metadata (ID, created at, last activity)
 * - Conversation history summary
 * - Project context
 */
export async function GET(request: Request): Promise<Response> {
  const sessionId = getSessionId(request);

  if (!sessionId) {
    // Return new session info (not yet created)
    const newSessionId = generateSessionId();
    
    const sessionInfo: SessionInfo = {
      id: newSessionId,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      messageCount: 0,
    };

    return new Response(JSON.stringify(sessionInfo), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `devcopilot_session=${newSessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
        ...CORS_HEADERS,
      },
    });
  }

  try {
    const workerResponse = await forwardToWorkerSession('GET', sessionId);

    if (!workerResponse.ok) {
      if (workerResponse.status === 404) {
        // Session not found, create new one
        const newSessionId = generateSessionId();
        
        const sessionInfo: SessionInfo = {
          id: newSessionId,
          createdAt: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
          messageCount: 0,
        };

        return new Response(JSON.stringify(sessionInfo), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': `devcopilot_session=${newSessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
            ...CORS_HEADERS,
          },
        });
      }
      
      return createErrorResponse('Failed to fetch session', 'SESSION_ERROR', workerResponse.status);
    }

    const sessionData = await workerResponse.json();

    return new Response(JSON.stringify(sessionData), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS,
      },
    });

  } catch (error) {
    console.error('[DevCopilot Session API] Error:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to fetch session',
      'INTERNAL_ERROR',
      500
    );
  }
}

/**
 * POST /api/session
 * 
 * Update session with new context or preferences.
 * 
 * Request body:
 * {
 *   projectContext?: {
 *     workerCode?: string,
 *     wranglerConfig?: string,
 *     recentErrors?: string[],
 *     services?: string[]
 *   },
 *   preferences?: {
 *     model?: string,
 *     maxTokens?: number
 *   }
 * }
 */
export async function POST(request: Request): Promise<Response> {
  let sessionId = getSessionId(request);
  let isNewSession = false;

  if (!sessionId) {
    sessionId = generateSessionId();
    isNewSession = true;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createErrorResponse('Invalid JSON', 'INVALID_JSON', 400);
  }

  // Validate body structure
  if (typeof body !== 'object' || body === null) {
    return createErrorResponse('Request body must be an object', 'VALIDATION_ERROR', 400);
  }

  try {
    const workerResponse = await forwardToWorkerSession('POST', sessionId, body);

    if (!workerResponse.ok) {
      const errorText = await workerResponse.text();
      console.error('[DevCopilot Session API] Worker error:', errorText);
      return createErrorResponse('Failed to update session', 'SESSION_ERROR', workerResponse.status);
    }

    const sessionData = await workerResponse.json();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    };

    if (isNewSession) {
      headers['Set-Cookie'] = `devcopilot_session=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`;
    }

    return new Response(JSON.stringify({
      success: true,
      session: sessionData,
      isNewSession,
    }), {
      status: 200,
      headers,
    });

  } catch (error) {
    console.error('[DevCopilot Session API] Error:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to update session',
      'INTERNAL_ERROR',
      500
    );
  }
}

/**
 * DELETE /api/session
 * 
 * Clear the current session, deleting all conversation history and context.
 */
export async function DELETE(request: Request): Promise<Response> {
  const sessionId = getSessionId(request);

  if (!sessionId) {
    return createErrorResponse('No session to delete', 'NO_SESSION', 400);
  }

  try {
    const workerResponse = await forwardToWorkerSession('DELETE', sessionId);

    if (!workerResponse.ok && workerResponse.status !== 404) {
      return createErrorResponse('Failed to delete session', 'SESSION_ERROR', workerResponse.status);
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Session cleared',
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': 'devcopilot_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0',
        ...CORS_HEADERS,
      },
    });

  } catch (error) {
    console.error('[DevCopilot Session API] Error:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to delete session',
      'INTERNAL_ERROR',
      500
    );
  }
}

export const runtime = 'edge';
export const dynamic = 'force-dynamic';
