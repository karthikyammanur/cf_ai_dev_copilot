/**
 * reviewWorkerCode - Tool for analyzing Cloudflare Workers code
 *
 * This tool performs static analysis on Worker code to identify:
 * - Performance anti-patterns
 * - Security vulnerabilities
 * - Missing error handling
 * - Cloudflare-specific optimizations
 * - General best practices
 *
 * @module tools/reviewWorkerCode
 */

import { tool } from "ai";
import { z } from "zod/v3";

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Categories of code issues
 */
export type IssueType =
  | "performance"
  | "security"
  | "best-practice"
  | "cloudflare-specific"
  | "error-handling";

/**
 * Severity levels for findings
 */
export type IssueSeverity = "critical" | "warning" | "suggestion";

/**
 * A single code review finding
 */
export interface CodeReviewFinding {
  /** Line number where the issue was found (1-indexed) */
  line?: number;
  /** Column position (optional) */
  column?: number;
  /** Category of the issue */
  type: IssueType;
  /** Severity level */
  severity: IssueSeverity;
  /** Description of the issue */
  issue: string;
  /** Recommendation for fixing the issue */
  recommendation: string;
  /** Code snippet showing the problematic code */
  problematicCode?: string;
  /** Code snippet showing the fix */
  fixedCode?: string;
  /** Rule identifier for the check */
  ruleId: string;
}

/**
 * Complete code review result
 */
export interface CodeReviewResult {
  /** Overall health score (0-100) */
  score: number;
  /** Summary of the review */
  summary: string;
  /** List of all findings */
  findings: CodeReviewFinding[];
  /** Count by severity */
  counts: {
    critical: number;
    warning: number;
    suggestion: number;
  };
  /** Count by type */
  typeBreakdown: Record<IssueType, number>;
}

/**
 * Pattern definition for code analysis
 */
interface AnalysisPattern {
  /** Unique rule identifier */
  ruleId: string;
  /** Display name */
  name: string;
  /** Issue type */
  type: IssueType;
  /** Severity level */
  severity: IssueSeverity;
  /** Regex pattern(s) to match */
  patterns: RegExp[];
  /** Anti-patterns - if these are present, skip the check */
  skipIfPresent?: RegExp[];
  /** Description of the issue */
  issue: string;
  /** How to fix it */
  recommendation: string;
  /** Example of fixed code */
  fixedCode?: string;
  /** Function to generate context-aware fix */
  generateFix?: (match: RegExpMatchArray, line: string) => string;
}

// =============================================================================
// Helper Functions for Code Parsing
// =============================================================================

/**
 * Split code into lines while preserving line numbers
 */
function splitIntoLines(code: string): string[] {
  return code.split(/\r?\n/);
}

/**
 * Find the line number for a match in the code
 */
function findLineNumber(code: string, matchIndex: number): number {
  const upToMatch = code.substring(0, matchIndex);
  return (upToMatch.match(/\n/g) || []).length + 1;
}

/**
 * Extract a code snippet around a specific line
 */
function extractSnippet(
  lines: string[],
  lineNum: number,
  context: number = 1
): string {
  const start = Math.max(0, lineNum - 1 - context);
  const end = Math.min(lines.length, lineNum + context);
  return lines.slice(start, end).join("\n");
}

/**
 * Check if a line is inside a comment
 */
function isInComment(code: string, position: number): boolean {
  // Check for single-line comment
  const lineStart = code.lastIndexOf("\n", position) + 1;
  const lineUpToPos = code.substring(lineStart, position);
  if (lineUpToPos.includes("//")) {
    return true;
  }

  // Check for multi-line comment (simplified check)
  const beforePos = code.substring(0, position);
  const lastBlockStart = beforePos.lastIndexOf("/*");
  const lastBlockEnd = beforePos.lastIndexOf("*/");

  return lastBlockStart > lastBlockEnd;
}

/**
 * Check if code is inside a string literal (simplified)
 * @internal Reserved for advanced pattern matching
 */
// @ts-expect-error Reserved for future use
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _isInString(code: string, position: number): boolean {
  const beforePos = code.substring(0, position);
  // Count unescaped quotes
  const singleQuotes = (beforePos.match(/(?<!\\)'/g) || []).length;
  const doubleQuotes = (beforePos.match(/(?<!\\)"/g) || []).length;
  const templateLiterals = (beforePos.match(/(?<!\\)`/g) || []).length;

  return (
    singleQuotes % 2 !== 0 ||
    doubleQuotes % 2 !== 0 ||
    templateLiterals % 2 !== 0
  );
}

/**
 * Detect the language (JS vs TS) from code
 */
function detectLanguage(code: string): "typescript" | "javascript" {
  const tsIndicators = [
    /:\s*(string|number|boolean|any|void|never|unknown)/,
    /interface\s+\w+/,
    /type\s+\w+\s*=/,
    /<\w+>/, // Generics
    /as\s+(const|string|number)/
  ];

  for (const pattern of tsIndicators) {
    if (pattern.test(code)) {
      return "typescript";
    }
  }
  return "javascript";
}

/**
 * Check if a try-catch block exists around a position
 * @internal Reserved for advanced pattern matching
 */
// @ts-expect-error Reserved for future use
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _hasTryCatchAround(code: string, position: number): boolean {
  // Look backwards for try { and check if we're inside it
  const before = code.substring(0, position);
  const tryMatches = [...before.matchAll(/\btry\s*\{/g)];

  if (tryMatches.length === 0) return false;

  // Check if there's a closing brace and catch after the last try
  const lastTry = tryMatches[tryMatches.length - 1];
  const afterTry = code.substring(lastTry.index! + lastTry[0].length, position);

  // Simple brace counting
  let braceCount = 1;
  for (const char of afterTry) {
    if (char === "{") braceCount++;
    if (char === "}") braceCount--;
    if (braceCount === 0) return false; // Exited try block
  }

  return braceCount > 0;
}

// =============================================================================
// Analysis Patterns (15+ checks)
// =============================================================================

const ANALYSIS_PATTERNS: AnalysisPattern[] = [
  // =========================================================================
  // PERFORMANCE ISSUES
  // =========================================================================
  {
    ruleId: "perf-sync-json-parse",
    name: "Synchronous JSON.parse on Large Data",
    type: "performance",
    severity: "warning",
    patterns: [
      /JSON\.parse\s*\(\s*await\s+\w+\.text\(\)\s*\)/g,
      /const\s+\w+\s*=\s*await\s+\w+\.text\(\)[\s\S]{0,50}JSON\.parse\s*\(\s*\w+\s*\)/g
    ],
    issue:
      "Using JSON.parse() on potentially large response text can block the CPU and exhaust time limits.",
    recommendation:
      "Use response.json() instead which is optimized for streaming, or implement streaming JSON parsing for very large payloads.",
    fixedCode: `// ❌ Before
const text = await response.text();
const data = JSON.parse(text);

// ✅ After - use built-in json() method
const data = await response.json();

// ✅ For very large JSON, consider streaming
import { JSONParser } from '@streamparser/json';`
  },

  {
    ruleId: "perf-blocking-loop",
    name: "Potentially Blocking Loop",
    type: "performance",
    severity: "warning",
    patterns: [
      /while\s*\(\s*true\s*\)/g,
      /for\s*\(\s*;\s*;\s*\)/g,
      /for\s*\([^)]*;\s*[^;]*<\s*\d{5,}/g // Loop with large iteration count
    ],
    issue:
      "Infinite or very large loops can exhaust CPU time limits (10ms free, 30ms paid, 30s Unbound).",
    recommendation:
      "Add loop limits, use async iteration with breaks, or offload to Durable Objects/Queues for long-running processes.",
    fixedCode: `// ❌ Before
while (true) {
  // process forever
}

// ✅ After - add limits and async breaks
const MAX_ITERATIONS = 1000;
let iterations = 0;

while (iterations < MAX_ITERATIONS) {
  if (shouldStop()) break;
  await processItem();
  iterations++;
}`
  },

  {
    ruleId: "perf-await-in-loop",
    name: "Sequential Await in Loop",
    type: "performance",
    severity: "warning",
    patterns: [
      /for\s*\([^)]*\)\s*\{[^}]*await\s+/g,
      /while\s*\([^)]*\)\s*\{[^}]*await\s+/g,
      /\.forEach\s*\(\s*async/g
    ],
    issue:
      "Awaiting inside a loop executes requests sequentially, wasting time when they could run in parallel.",
    recommendation:
      "Use Promise.all() or Promise.allSettled() to parallelize independent async operations. Be mindful of subrequest limits (50 free, 1000 paid).",
    fixedCode: `// ❌ Before - sequential (slow)
for (const url of urls) {
  const response = await fetch(url);
  results.push(await response.json());
}

// ✅ After - parallel (fast)
const responses = await Promise.all(
  urls.map(url => fetch(url))
);
const results = await Promise.all(
  responses.map(r => r.json())
);

// ✅ With error handling
const results = await Promise.allSettled(
  urls.map(async url => {
    const response = await fetch(url);
    return response.json();
  })
);`
  },

  {
    ruleId: "perf-large-response-buffer",
    name: "Buffering Large Response",
    type: "performance",
    severity: "warning",
    patterns: [
      /await\s+\w+\.text\(\)/g,
      /await\s+\w+\.arrayBuffer\(\)/g,
      /await\s+\w+\.blob\(\)/g
    ],
    skipIfPresent: [
      /\.json\(\)/ // json() is usually fine
    ],
    issue:
      "Buffering entire response body (.text(), .arrayBuffer(), .blob()) consumes memory and can hit the 128MB limit.",
    recommendation:
      "Use streaming with TransformStream or pipe directly to response for large payloads.",
    fixedCode: `// ❌ Before - buffers entire body
const data = await response.arrayBuffer();
return new Response(processData(data));

// ✅ After - stream the response
const { readable, writable } = new TransformStream({
  transform(chunk, controller) {
    controller.enqueue(processChunk(chunk));
  }
});

response.body.pipeTo(writable);
return new Response(readable);`
  },

  {
    ruleId: "perf-no-cache-api",
    name: "Missing Cache API Usage",
    type: "cloudflare-specific",
    severity: "suggestion",
    patterns: [/fetch\s*\(\s*['"`][^'"`]+['"`]\s*\)/g],
    skipIfPresent: [/caches\.default/, /caches\.open/, /cache-control/i],
    issue:
      "External fetch calls without caching can lead to repeated slow requests and unnecessary subrequest usage.",
    recommendation:
      "Use the Cache API to cache external responses at the edge, reducing latency and subrequest count.",
    fixedCode: `// ✅ Using Cache API
export default {
  async fetch(request, env, ctx) {
    const cache = caches.default;
    const cacheKey = new Request(request.url, request);
    
    // Check cache first
    let response = await cache.match(cacheKey);
    if (response) {
      return response;
    }
    
    // Fetch from origin
    response = await fetch(request);
    
    // Clone and cache the response
    const responseToCache = response.clone();
    ctx.waitUntil(cache.put(cacheKey, responseToCache));
    
    return response;
  }
}`
  },

  // =========================================================================
  // SECURITY ISSUES
  // =========================================================================
  {
    ruleId: "sec-hardcoded-secret",
    name: "Hardcoded Secret/API Key",
    type: "security",
    severity: "critical",
    patterns: [
      /['"`](sk-[a-zA-Z0-9]{20,})['"`]/g, // OpenAI keys
      /['"`](AKIA[A-Z0-9]{16})['"`]/g, // AWS keys
      /['"`](ghp_[a-zA-Z0-9]{36})['"`]/g, // GitHub tokens
      /api[_-]?key\s*[=:]\s*['"`][a-zA-Z0-9_-]{20,}['"`]/gi,
      /secret\s*[=:]\s*['"`][a-zA-Z0-9_-]{16,}['"`]/gi,
      /password\s*[=:]\s*['"`][^'"`]{8,}['"`]/gi,
      /bearer\s+[a-zA-Z0-9_\-.]{20,}/gi
    ],
    issue:
      "Hardcoded secrets in code can be exposed in version control, logs, and error messages.",
    recommendation:
      "Store secrets using Wrangler secrets (wrangler secret put) and access via env bindings.",
    fixedCode: `// ❌ Before - hardcoded secret
const apiKey = 'sk-abc123...';
fetch('https://api.example.com', {
  headers: { 'Authorization': 'Bearer sk-abc123...' }
});

// ✅ After - use environment secrets
// Set with: wrangler secret put API_KEY
export default {
  async fetch(request, env) {
    const response = await fetch('https://api.example.com', {
      headers: { 'Authorization': \`Bearer \${env.API_KEY}\` }
    });
    return response;
  }
}`
  },

  {
    ruleId: "sec-eval-usage",
    name: "Dangerous eval() Usage",
    type: "security",
    severity: "critical",
    patterns: [
      /\beval\s*\(/g,
      /new\s+Function\s*\(/g,
      /setTimeout\s*\(\s*['"`]/g, // setTimeout with string
      /setInterval\s*\(\s*['"`]/g // setInterval with string
    ],
    issue:
      "eval() and dynamic code execution can lead to code injection attacks if user input is included.",
    recommendation:
      "Avoid eval() entirely. Use JSON.parse() for data, or pre-defined functions instead of dynamic code.",
    fixedCode: `// ❌ Before - dangerous eval
const result = eval(userInput);

// ❌ Also dangerous
const fn = new Function('return ' + userInput);

// ✅ After - use JSON.parse for data
const data = JSON.parse(userInput);

// ✅ Use predefined handlers
const handlers = {
  action1: () => { /* ... */ },
  action2: () => { /* ... */ },
};
const result = handlers[userInput]?.();`
  },

  {
    ruleId: "sec-xss-vulnerability",
    name: "Potential XSS Vulnerability",
    type: "security",
    severity: "critical",
    patterns: [
      /text\/html['"`]\s*\}\s*\)[\s\S]*\$\{/g, // HTML response with template literal
      /innerHTML\s*=/g,
      /document\.write\s*\(/g,
      /\.html\s*\([^)]*\+/g // jQuery .html() with concatenation
    ],
    issue:
      "Directly inserting user input into HTML can lead to Cross-Site Scripting (XSS) attacks.",
    recommendation:
      "Escape HTML entities before insertion, use textContent instead of innerHTML, or use a templating library with auto-escaping.",
    fixedCode: `// ❌ Before - XSS vulnerable
return new Response(\`<div>\${userInput}</div>\`, {
  headers: { 'content-type': 'text/html' }
});

// ✅ After - escape HTML entities
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

return new Response(\`<div>\${escapeHtml(userInput)}</div>\`, {
  headers: { 'content-type': 'text/html' }
});`
  },

  {
    ruleId: "sec-open-redirect",
    name: "Potential Open Redirect",
    type: "security",
    severity: "warning",
    patterns: [
      /Response\.redirect\s*\([^)]*request\.(url|query|params)/gi,
      /new\s+URL\s*\([^)]*\+[^)]*\)/g,
      /location\s*=\s*[^;]*request/gi
    ],
    issue:
      "Redirecting to user-supplied URLs can lead to phishing attacks via open redirects.",
    recommendation:
      "Validate redirect URLs against an allowlist of trusted domains.",
    fixedCode: `// ❌ Before - open redirect
const redirectUrl = new URL(request.url).searchParams.get('redirect');
return Response.redirect(redirectUrl);

// ✅ After - validate against allowlist
const ALLOWED_DOMAINS = ['example.com', 'trusted.com'];

function isValidRedirect(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_DOMAINS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

const redirectUrl = new URL(request.url).searchParams.get('redirect');
if (!redirectUrl || !isValidRedirect(redirectUrl)) {
  return new Response('Invalid redirect', { status: 400 });
}
return Response.redirect(redirectUrl);`
  },

  // =========================================================================
  // ERROR HANDLING
  // =========================================================================
  {
    ruleId: "err-missing-try-catch",
    name: "Missing Error Handling on Fetch",
    type: "error-handling",
    severity: "warning",
    patterns: [/(?<!try\s*\{[^}]*)await\s+fetch\s*\(/g],
    issue:
      "Fetch calls without try-catch can cause unhandled exceptions that crash the Worker.",
    recommendation:
      "Wrap fetch calls in try-catch and handle network errors gracefully.",
    fixedCode: `// ❌ Before - unhandled errors
const response = await fetch('https://api.example.com/data');
const data = await response.json();

// ✅ After - proper error handling
try {
  const response = await fetch('https://api.example.com/data');
  
  if (!response.ok) {
    throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
  }
  
  const data = await response.json();
  return Response.json(data);
} catch (error) {
  console.error('Fetch failed:', error);
  return Response.json(
    { error: 'Service temporarily unavailable' },
    { status: 503 }
  );
}`
  },

  {
    ruleId: "err-missing-response-check",
    name: "Missing Response.ok Check",
    type: "error-handling",
    severity: "warning",
    patterns: [
      /await\s+fetch\s*\([^)]+\)[\s\S]*?\.json\s*\(\)/g,
      /await\s+fetch\s*\([^)]+\)[\s\S]*?\.text\s*\(\)/g
    ],
    skipIfPresent: [/\.ok\b/, /\.status\b/, /if\s*\(\s*!?\s*response/],
    issue:
      "Reading response body without checking response.ok can lead to parsing errors on error responses.",
    recommendation:
      "Always check response.ok or response.status before parsing the response body.",
    fixedCode: `// ❌ Before - no status check
const response = await fetch(url);
const data = await response.json(); // Fails if response is error HTML!

// ✅ After - check status first
const response = await fetch(url);

if (!response.ok) {
  // Handle error response
  const errorText = await response.text();
  console.error(\`API error \${response.status}: \${errorText}\`);
  throw new Error(\`API returned \${response.status}\`);
}

const data = await response.json();`
  },

  {
    ruleId: "err-empty-catch",
    name: "Empty Catch Block",
    type: "error-handling",
    severity: "warning",
    patterns: [/catch\s*\([^)]*\)\s*\{\s*\}/g, /catch\s*\{\s*\}/g],
    issue:
      "Empty catch blocks swallow errors silently, making debugging impossible.",
    recommendation:
      "At minimum, log the error. Better yet, handle it appropriately or re-throw.",
    fixedCode: `// ❌ Before - silent error swallowing
try {
  await riskyOperation();
} catch (e) {
  // Errors disappear into the void
}

// ✅ After - proper error handling
try {
  await riskyOperation();
} catch (error) {
  console.error('Operation failed:', error);
  
  // Option 1: Return error response
  return Response.json({ error: 'Operation failed' }, { status: 500 });
  
  // Option 2: Re-throw for upstream handling
  // throw error;
  
  // Option 3: Use fallback
  // return fallbackValue;
}`
  },

  // =========================================================================
  // CLOUDFLARE-SPECIFIC
  // =========================================================================
  {
    ruleId: "cf-missing-waituntil",
    name: "Background Work Without waitUntil",
    type: "cloudflare-specific",
    severity: "warning",
    patterns: [
      /return\s+new\s+Response[^;]+;[^}]*(?:fetch|put|delete|send)\s*\(/gi
    ],
    skipIfPresent: [/waitUntil/, /ctx\.waitUntil/, /context\.waitUntil/],
    issue:
      "Background async operations after returning a response may be terminated before completion.",
    recommendation:
      "Use ctx.waitUntil() to ensure background work completes even after the response is sent.",
    fixedCode: `// ❌ Before - background work may be killed
export default {
  async fetch(request, env) {
    const response = new Response('OK');
    
    // This might not complete!
    fetch('https://analytics.example.com/log', {
      method: 'POST',
      body: JSON.stringify({ event: 'request' })
    });
    
    return response;
  }
}

// ✅ After - use waitUntil
export default {
  async fetch(request, env, ctx) {
    const response = new Response('OK');
    
    // Guaranteed to complete
    ctx.waitUntil(
      fetch('https://analytics.example.com/log', {
        method: 'POST',
        body: JSON.stringify({ event: 'request' })
      })
    );
    
    return response;
  }
}`
  },

  {
    ruleId: "cf-kv-without-cache",
    name: "KV Read Without Caching Strategy",
    type: "cloudflare-specific",
    severity: "suggestion",
    patterns: [/\.get\s*\(\s*['"`][^'"]+['"`]\s*\)/g],
    skipIfPresent: [/cacheTtl/, /expirationTtl/, /cache/i],
    issue:
      "KV reads without caching options may not leverage edge caching effectively.",
    recommendation:
      "Use cacheTtl option for frequently-read values to reduce KV read operations and latency.",
    fixedCode: `// ❌ Before - no caching options
const value = await env.MY_KV.get('key');

// ✅ After - with cache TTL
const value = await env.MY_KV.get('key', {
  cacheTtl: 60,  // Cache at edge for 60 seconds
  type: 'json'   // Parse as JSON automatically
});

// ✅ For values that rarely change
const config = await env.MY_KV.get('config', {
  cacheTtl: 3600,  // Cache for 1 hour
  type: 'json'
});`
  },

  {
    ruleId: "cf-wrong-storage-choice",
    name: "Consider Different Storage Option",
    type: "cloudflare-specific",
    severity: "suggestion",
    patterns: [
      /KV\.put\s*\([^,]+,\s*JSON\.stringify\s*\(\s*\{[^}]{500,}\}/g, // Large JSON in KV
      /D1[\s\S]*SELECT[\s\S]*LIKE\s*['"]%/gi // Full-text search in D1
    ],
    issue:
      "Storage choice may not be optimal for this use case. KV is best for key-value access, D1 for relational queries, R2 for large files.",
    recommendation:
      "Consider: KV for config/sessions (<25MB values), D1 for relational data, R2 for files/blobs (>1MB), Vectorize for similarity search.",
    fixedCode: `// Storage selection guide:

// ✅ KV - Fast key-value, eventually consistent
// Best for: Config, sessions, cache, feature flags
await env.KV.put('user:123', JSON.stringify(userData));

// ✅ D1 - SQLite at the edge
// Best for: Relational data, complex queries, transactions
await env.DB.prepare('SELECT * FROM users WHERE team_id = ?')
  .bind(teamId).all();

// ✅ R2 - Object storage (S3-compatible)
// Best for: Files, images, large blobs, backups
await env.BUCKET.put('uploads/image.png', imageData);

// ✅ Durable Objects - Strong consistency
// Best for: Real-time collaboration, WebSockets, counters
const id = env.COUNTER.idFromName('global');
const counter = env.COUNTER.get(id);

// ✅ Vectorize - Vector similarity search
// Best for: Semantic search, recommendations
await env.VECTOR_INDEX.query(embedding, { topK: 10 });`
  },

  {
    ruleId: "cf-missing-cors",
    name: "Missing CORS Headers",
    type: "cloudflare-specific",
    severity: "warning",
    patterns: [
      /return\s+(new\s+)?Response\.json\s*\(/g,
      /return\s+new\s+Response\s*\([^)]+\)/g
    ],
    skipIfPresent: [/access-control/i, /cors/i, /OPTIONS/],
    issue:
      "API responses without CORS headers will be blocked by browsers for cross-origin requests.",
    recommendation:
      "Add CORS headers if this API is called from browsers on different domains.",
    fixedCode: `// ✅ Add CORS headers to responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request, env) {
    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // Your handler
    const data = { message: 'Hello' };
    
    return Response.json(data, {
      headers: corsHeaders
    });
  }
}`
  },

  // =========================================================================
  // BEST PRACTICES
  // =========================================================================
  {
    ruleId: "bp-console-in-prod",
    name: "Console Logging in Production",
    type: "best-practice",
    severity: "suggestion",
    patterns: [/console\.(log|debug|info)\s*\(/g],
    issue:
      "Excessive console logging can impact performance and clutter production logs.",
    recommendation:
      "Use structured logging, log levels, and consider conditional logging based on environment.",
    fixedCode: `// ❌ Before - unstructured logging
console.log('Processing request', request.url);
console.log('User data:', userData);

// ✅ After - structured logging with levels
const LOG_LEVEL = env.LOG_LEVEL || 'info';

function log(level: string, message: string, data?: object) {
  if (shouldLog(level, LOG_LEVEL)) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...data
    }));
  }
}

log('debug', 'Processing request', { url: request.url });
log('info', 'Request completed', { status: 200, duration: 45 });`
  },

  {
    ruleId: "bp-missing-types",
    name: "Missing TypeScript Types",
    type: "best-practice",
    severity: "suggestion",
    patterns: [
      /:\s*any\b/g,
      /as\s+any\b/g,
      /\/\/\s*@ts-ignore/g,
      /\/\/\s*@ts-nocheck/g
    ],
    issue:
      'Using "any" type or ignoring TypeScript checks reduces type safety and can hide bugs.',
    recommendation:
      'Define proper types for your data structures. Use "unknown" instead of "any" when type is truly unknown.',
    fixedCode: `// ❌ Before - losing type safety
async function handleRequest(data: any) {
  const result = data.items.map((item: any) => item.value);
  return result as any;
}

// ✅ After - proper typing
interface RequestData {
  items: Array<{ id: string; value: number }>;
}

interface ResponseData {
  values: number[];
}

async function handleRequest(data: RequestData): Promise<ResponseData> {
  const values = data.items.map(item => item.value);
  return { values };
}`
  },

  {
    ruleId: "bp-magic-numbers",
    name: "Magic Numbers in Code",
    type: "best-practice",
    severity: "suggestion",
    patterns: [
      /setTimeout\s*\([^,]+,\s*\d{4,}\)/g, // setTimeout with raw ms
      /status:\s*\d{3}/g, // Raw status codes
      /cacheTtl:\s*\d{4,}/g // Raw TTL values
    ],
    issue: "Magic numbers make code harder to understand and maintain.",
    recommendation:
      "Extract magic numbers into named constants with clear meaning.",
    fixedCode: `// ❌ Before - magic numbers
setTimeout(cleanup, 86400000);
return new Response('', { status: 429 });
await env.KV.put(key, value, { expirationTtl: 604800 });

// ✅ After - named constants
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_SECONDS = 7 * 24 * 60 * 60;

const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
} as const;

setTimeout(cleanup, ONE_DAY_MS);
return new Response('', { status: HTTP_STATUS.TOO_MANY_REQUESTS });
await env.KV.put(key, value, { expirationTtl: ONE_WEEK_SECONDS });`
  }
];

// =============================================================================
// Main Analysis Function
// =============================================================================

/**
 * Analyze Worker code for issues
 */
export function reviewWorkerCodeFn(code: string): CodeReviewResult {
  const findings: CodeReviewFinding[] = [];
  const lines = splitIntoLines(code);

  // Run each pattern check
  for (const pattern of ANALYSIS_PATTERNS) {
    // Check skip conditions first
    if (pattern.skipIfPresent) {
      let shouldSkip = false;
      for (const skipPattern of pattern.skipIfPresent) {
        if (skipPattern.test(code)) {
          shouldSkip = true;
          break;
        }
      }
      if (shouldSkip) continue;
    }

    // Check each matching pattern
    for (const regex of pattern.patterns) {
      // Reset regex state
      regex.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = regex.exec(code))) {
        const position = match.index;

        // Skip if in comment or string (for some patterns)
        if (isInComment(code, position)) continue;

        const lineNum = findLineNumber(code, position);
        const problematicCode = extractSnippet(lines, lineNum, 1);

        // Check for duplicates
        const isDuplicate = findings.some(
          (f) => f.ruleId === pattern.ruleId && f.line === lineNum
        );

        if (!isDuplicate) {
          findings.push({
            line: lineNum,
            type: pattern.type,
            severity: pattern.severity,
            issue: pattern.issue,
            recommendation: pattern.recommendation,
            problematicCode,
            fixedCode: pattern.generateFix
              ? pattern.generateFix(match, lines[lineNum - 1])
              : pattern.fixedCode,
            ruleId: pattern.ruleId
          });
        }

        // Prevent infinite loops with zero-width matches
        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }
      }
    }
  }

  // Sort findings by severity, then line number
  const severityOrder = { critical: 0, warning: 1, suggestion: 2 };
  findings.sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return (a.line || 0) - (b.line || 0);
  });

  // Calculate counts
  const counts = {
    critical: findings.filter((f) => f.severity === "critical").length,
    warning: findings.filter((f) => f.severity === "warning").length,
    suggestion: findings.filter((f) => f.severity === "suggestion").length
  };

  const typeBreakdown: Record<IssueType, number> = {
    performance: 0,
    security: 0,
    "best-practice": 0,
    "cloudflare-specific": 0,
    "error-handling": 0
  };

  for (const finding of findings) {
    typeBreakdown[finding.type]++;
  }

  // Calculate health score (0-100)
  const totalDeductions =
    counts.critical * 20 + counts.warning * 5 + counts.suggestion * 1;
  const score = Math.max(0, 100 - totalDeductions);

  // Generate summary
  let summary = "";
  if (counts.critical > 0) {
    summary = `Found ${counts.critical} critical issue(s) that require immediate attention. `;
  }
  if (counts.warning > 0) {
    summary += `${counts.warning} warning(s) should be addressed. `;
  }
  if (counts.suggestion > 0) {
    summary += `${counts.suggestion} suggestion(s) for improvement. `;
  }
  if (findings.length === 0) {
    summary =
      "No issues found. The code follows Cloudflare Workers best practices.";
  }

  // Add language detection note
  const language = detectLanguage(code);
  summary += `\nDetected language: ${language === "typescript" ? "TypeScript" : "JavaScript"}`;

  return {
    score,
    summary: summary.trim(),
    findings,
    counts,
    typeBreakdown
  };
}

// =============================================================================
// AI Tool Definition
// =============================================================================

const reviewWorkerCodeSchema = z.object({
  code: z
    .string()
    .describe(
      "The Cloudflare Worker code to analyze. Can be JavaScript or TypeScript."
    ),
  focusAreas: z
    .array(
      z.enum([
        "performance",
        "security",
        "best-practice",
        "cloudflare-specific",
        "error-handling"
      ])
    )
    .optional()
    .describe(
      "Optional: Focus analysis on specific areas. If not provided, all areas are checked."
    )
});

/**
 * AI Tool: Review Cloudflare Worker code for issues
 */
export const reviewWorkerCode = tool({
  description: `Analyze Cloudflare Worker code for performance issues, security vulnerabilities, and best practices.

This tool checks for:
- Performance anti-patterns (blocking operations, inefficient async, missing caching)
- Security issues (hardcoded secrets, XSS, open redirects, eval usage)
- Error handling (missing try-catch, unchecked responses, empty catch blocks)
- Cloudflare-specific optimizations (Cache API, waitUntil, storage choices, CORS)
- General best practices (TypeScript types, logging, magic numbers)

Provide the complete Worker code for comprehensive analysis.`,
  inputSchema: reviewWorkerCodeSchema,
  execute: async ({ code, focusAreas }) => {
    const result = reviewWorkerCodeFn(code);

    // Filter by focus areas if specified
    let filteredFindings = result.findings;
    if (focusAreas && focusAreas.length > 0) {
      filteredFindings = result.findings.filter((f) =>
        focusAreas.includes(f.type as (typeof focusAreas)[number])
      );
    }

    // Format response
    let response = `## Code Review Results

**Health Score:** ${result.score}/100
${result.summary}

### Issue Summary
- 🔴 Critical: ${result.counts.critical}
- 🟡 Warning: ${result.counts.warning}  
- 🔵 Suggestion: ${result.counts.suggestion}

### Breakdown by Category
- Performance: ${result.typeBreakdown.performance}
- Security: ${result.typeBreakdown.security}
- Error Handling: ${result.typeBreakdown["error-handling"]}
- Cloudflare-Specific: ${result.typeBreakdown["cloudflare-specific"]}
- Best Practices: ${result.typeBreakdown["best-practice"]}
`;

    if (filteredFindings.length > 0) {
      response += `\n### Detailed Findings\n`;

      for (const finding of filteredFindings) {
        const severityIcon =
          finding.severity === "critical"
            ? "🔴"
            : finding.severity === "warning"
              ? "🟡"
              : "🔵";

        response += `
#### ${severityIcon} ${finding.issue}
**Rule:** \`${finding.ruleId}\` | **Type:** ${finding.type} | **Line:** ${finding.line || "N/A"}

${finding.recommendation}
`;

        if (finding.fixedCode) {
          response += `
\`\`\`typescript
${finding.fixedCode}
\`\`\`
`;
        }
      }
    }

    return response;
  }
});

export { reviewWorkerCodeFn as analyzeCode };
