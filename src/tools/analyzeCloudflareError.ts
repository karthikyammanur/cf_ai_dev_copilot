/**
 * analyzeCloudflareError - Tool for analyzing Cloudflare Worker error logs
 * 
 * This tool parses error logs, stack traces, and Worker console output to identify
 * common Cloudflare-specific errors and provide actionable debugging guidance.
 * 
 * @module tools/analyzeCloudflareError
 */

import { tool } from "ai";
import { z } from "zod/v3";

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Severity levels for error classification
 */
export type ErrorSeverity = 'critical' | 'warning' | 'info';

/**
 * Categories of Cloudflare Worker errors
 */
export type CloudflareErrorCategory = 
  | 'runtime-limits'
  | 'binding-errors'
  | 'network-errors'
  | 'configuration'
  | 'api-errors'
  | 'security'
  | 'unknown';

/**
 * Structured response from error analysis
 */
export interface ErrorAnalysisResult {
  /** Identified error type name */
  errorType: string;
  /** Error category for grouping */
  category: CloudflareErrorCategory;
  /** Severity level */
  severity: ErrorSeverity;
  /** Explanation of what caused the error */
  rootCause: string;
  /** Step-by-step fix instructions */
  suggestedFix: string;
  /** Code example demonstrating the fix */
  codeExample?: string;
  /** Link to relevant Cloudflare documentation */
  docsLink?: string;
  /** Additional tips to prevent future occurrences */
  bestPractices?: string[];
  /** Confidence score (0-1) of the match */
  confidence: number;
}

/**
 * Pattern definition for error matching
 */
interface ErrorPattern {
  /** Unique identifier for the error type */
  id: string;
  /** Display name */
  name: string;
  /** Error category */
  category: CloudflareErrorCategory;
  /** Severity level */
  severity: ErrorSeverity;
  /** Regex patterns to match against error logs */
  patterns: RegExp[];
  /** Keywords that might appear in the error */
  keywords: string[];
  /** Root cause explanation */
  rootCause: string;
  /** How to fix the error */
  suggestedFix: string;
  /** Code example */
  codeExample?: string;
  /** Documentation link */
  docsLink: string;
  /** Best practices */
  bestPractices: string[];
}

// =============================================================================
// Error Pattern Definitions
// =============================================================================

/**
 * Comprehensive list of Cloudflare Worker error patterns
 */
const ERROR_PATTERNS: ErrorPattern[] = [
  // -------------------------------------------------------------------------
  // Runtime Limit Errors
  // -------------------------------------------------------------------------
  {
    id: 'cpu-time-exceeded',
    name: 'CPU Time Limit Exceeded',
    category: 'runtime-limits',
    severity: 'critical',
    patterns: [
      /exceeded.*cpu.*time/i,
      /cpu.*time.*limit/i,
      /worker.*exceeded.*time/i,
      /Error 1102/i,
      /exceeded the CPU time limit/i
    ],
    keywords: ['cpu', 'time limit', 'exceeded', '1102', 'timeout'],
    rootCause: 'Your Worker script is performing too many CPU-intensive operations within a single request. The free tier allows 10ms CPU time, while paid plans allow 30-50ms (with option for 30s on Unbound).',
    suggestedFix: `1. Identify expensive operations (JSON parsing, crypto, loops)
2. Use streaming instead of buffering large responses
3. Offload heavy computation to Durable Objects or Queues
4. Consider upgrading to Workers Unbound for 30s CPU time
5. Use the \`waitUntil()\` method for non-critical background work`,
    codeExample: `// Instead of blocking computation:
// ❌ Bad: Synchronous heavy operation
const result = heavyComputation(data);
return new Response(result);

// ✅ Good: Use waitUntil for non-critical work
export default {
  async fetch(request, env, ctx) {
    // Return response immediately
    const response = new Response("Processing started");
    
    // Do heavy work in background
    ctx.waitUntil(async () => {
      await heavyComputation(data);
      await env.QUEUE.send({ status: 'completed' });
    });
    
    return response;
  }
}`,
    docsLink: 'https://developers.cloudflare.com/workers/platform/limits/#cpu-time',
    bestPractices: [
      'Profile your Worker using wrangler dev --inspect',
      'Break down large operations into smaller chunks',
      'Use Queues for background processing',
      'Consider using Workers Unbound for compute-heavy workloads'
    ]
  },

  {
    id: 'memory-limit-exceeded',
    name: 'Memory Limit Exceeded',
    category: 'runtime-limits',
    severity: 'critical',
    patterns: [
      /memory.*limit.*exceeded/i,
      /out of memory/i,
      /exceeded.*memory/i,
      /RangeError.*allocation/i,
      /heap.*limit/i
    ],
    keywords: ['memory', 'heap', 'allocation', 'out of memory'],
    rootCause: 'Your Worker is consuming more than the 128MB memory limit. This typically happens when processing large files, accumulating data in arrays/objects, or memory leaks in long-running Durable Objects.',
    suggestedFix: `1. Stream large responses instead of buffering
2. Avoid storing large objects in memory
3. Process data in chunks
4. Clear references to allow garbage collection
5. Use R2 for large file storage`,
    codeExample: `// ❌ Bad: Buffering entire response
const data = await response.text(); // Could be huge!
const processed = processData(data);

// ✅ Good: Stream the response
export default {
  async fetch(request, env) {
    const response = await fetch('https://api.example.com/large-data');
    
    // Transform stream without buffering
    const { readable, writable } = new TransformStream({
      transform(chunk, controller) {
        // Process chunk by chunk
        controller.enqueue(processChunk(chunk));
      }
    });
    
    response.body.pipeTo(writable);
    return new Response(readable, response);
  }
}`,
    docsLink: 'https://developers.cloudflare.com/workers/platform/limits/#memory',
    bestPractices: [
      'Use streaming APIs (TransformStream, ReadableStream)',
      'Avoid JSON.parse() on large payloads - use streaming JSON parsers',
      'Implement pagination for large datasets',
      'Use R2 for file storage instead of in-memory processing'
    ]
  },

  {
    id: 'subrequest-limit',
    name: 'Subrequest Limit Exceeded',
    category: 'runtime-limits',
    severity: 'critical',
    patterns: [
      /subrequest.*limit/i,
      /too many subrequests/i,
      /exceeded.*50.*subrequests/i,
      /Error 1101/i
    ],
    keywords: ['subrequest', 'fetch', '50', 'limit', '1101'],
    rootCause: 'Workers have a limit of 50 subrequests (fetch calls to external services) per request on the free tier, or 1000 on paid plans. This includes KV, D1, R2, and external API calls.',
    suggestedFix: `1. Batch multiple API calls where possible
2. Use caching to reduce repeated requests
3. Implement request deduplication
4. Use Queues to spread work across multiple invocations
5. Upgrade to a paid plan for 1000 subrequests`,
    codeExample: `// ❌ Bad: Many individual fetches
const results = await Promise.all(
  urls.map(url => fetch(url)) // Could exceed 50!
);

// ✅ Good: Batch requests and use caching
export default {
  async fetch(request, env) {
    const urls = getUrls(request);
    
    // Check cache first
    const cached = await env.CACHE.get('batch-result');
    if (cached) return new Response(cached);
    
    // Batch into chunks of 10
    const chunks = chunkArray(urls, 10);
    const results = [];
    
    for (const chunk of chunks) {
      const batchResult = await Promise.all(
        chunk.map(url => fetch(url))
      );
      results.push(...batchResult);
    }
    
    // Cache the result
    await env.CACHE.put('batch-result', JSON.stringify(results), {
      expirationTtl: 300
    });
    
    return Response.json(results);
  }
}`,
    docsLink: 'https://developers.cloudflare.com/workers/platform/limits/#subrequests',
    bestPractices: [
      'Use Cache API or KV for frequently accessed data',
      'Batch API calls using bulk endpoints when available',
      'Implement request coalescing for duplicate requests',
      'Consider using Queues for fan-out patterns'
    ]
  },

  // -------------------------------------------------------------------------
  // Binding Errors
  // -------------------------------------------------------------------------
  {
    id: 'kv-binding-error',
    name: 'KV Namespace Binding Error',
    category: 'binding-errors',
    severity: 'critical',
    patterns: [
      /kv.*binding.*not.*found/i,
      /kv.*namespace.*undefined/i,
      /cannot read.*kv/i,
      /env\..*is undefined.*kv/i,
      /KVNamespace/i
    ],
    keywords: ['KV', 'binding', 'namespace', 'undefined', 'not found'],
    rootCause: 'The KV namespace binding is not properly configured in wrangler.toml, or you\'re accessing it with the wrong name. The binding name in your code must match exactly what\'s in wrangler.toml.',
    suggestedFix: `1. Verify KV namespace exists: wrangler kv namespace list
2. Check wrangler.toml has correct binding configuration
3. Ensure binding name in code matches wrangler.toml exactly (case-sensitive)
4. For local dev, ensure you have a preview_id or use --local flag`,
    codeExample: `// wrangler.toml
[[kv_namespaces]]
binding = "MY_KV"  # This is what you use in code
id = "abc123..."   # From: wrangler kv namespace create "MY_KV"
preview_id = "xyz789..."  # For local development

// worker.ts
export default {
  async fetch(request, env) {
    // ✅ Use the exact binding name from wrangler.toml
    const value = await env.MY_KV.get("key");
    
    // ❌ Wrong: Different case or name
    // const value = await env.my_kv.get("key");
    // const value = await env.KV.get("key");
    
    return new Response(value);
  }
}`,
    docsLink: 'https://developers.cloudflare.com/kv/get-started/',
    bestPractices: [
      'Use consistent naming conventions for bindings',
      'Add TypeScript types for your Env interface',
      'Test bindings locally with wrangler dev before deploying',
      'Use wrangler kv namespace list to verify namespaces'
    ]
  },

  {
    id: 'd1-binding-error',
    name: 'D1 Database Binding Error',
    category: 'binding-errors',
    severity: 'critical',
    patterns: [
      /d1.*binding.*not.*found/i,
      /d1.*database.*undefined/i,
      /cannot.*prepare.*statement/i,
      /D1_ERROR/i,
      /env\.DB.*undefined/i
    ],
    keywords: ['D1', 'database', 'binding', 'prepare', 'statement', 'SQL'],
    rootCause: 'The D1 database binding is missing or incorrectly configured. This can also occur when SQL syntax errors cause prepare() to fail.',
    suggestedFix: `1. Verify D1 database exists: wrangler d1 list
2. Check wrangler.toml has correct binding
3. Test SQL queries locally: wrangler d1 execute <DB> --local --command "SELECT 1"
4. Ensure you're using parameterized queries correctly`,
    codeExample: `// wrangler.toml
[[d1_databases]]
binding = "DB"
database_name = "my-database"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

// worker.ts
export default {
  async fetch(request, env) {
    try {
      // ✅ Correct: Parameterized query
      const result = await env.DB
        .prepare("SELECT * FROM users WHERE id = ?")
        .bind(userId)
        .first();
      
      // ❌ Wrong: String interpolation (SQL injection risk!)
      // const result = await env.DB
      //   .prepare(\`SELECT * FROM users WHERE id = \${userId}\`)
      //   .first();
      
      return Response.json(result);
    } catch (error) {
      // Handle D1 errors gracefully
      console.error('D1 Error:', error);
      return Response.json({ error: 'Database error' }, { status: 500 });
    }
  }
}`,
    docsLink: 'https://developers.cloudflare.com/d1/get-started/',
    bestPractices: [
      'Always use parameterized queries to prevent SQL injection',
      'Run migrations with wrangler d1 migrations apply',
      'Test queries locally before deploying',
      'Implement proper error handling for database operations'
    ]
  },

  {
    id: 'r2-binding-error',
    name: 'R2 Bucket Binding Error',
    category: 'binding-errors',
    severity: 'critical',
    patterns: [
      /r2.*binding.*not.*found/i,
      /r2.*bucket.*undefined/i,
      /R2Bucket/i,
      /env\.BUCKET.*undefined/i,
      /cannot.*put.*r2/i
    ],
    keywords: ['R2', 'bucket', 'binding', 'storage', 'object'],
    rootCause: 'The R2 bucket binding is not configured in wrangler.toml, or the bucket doesn\'t exist in your Cloudflare account.',
    suggestedFix: `1. Create bucket if needed: wrangler r2 bucket create <name>
2. Add binding to wrangler.toml
3. Verify bucket exists: wrangler r2 bucket list
4. Check binding name matches exactly in code`,
    codeExample: `// wrangler.toml
[[r2_buckets]]
binding = "MY_BUCKET"
bucket_name = "my-files-bucket"
preview_bucket_name = "my-files-bucket-preview"  # For local dev

// worker.ts
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const key = url.pathname.slice(1);
    
    switch (request.method) {
      case 'PUT':
        await env.MY_BUCKET.put(key, request.body, {
          httpMetadata: {
            contentType: request.headers.get('content-type') || 'application/octet-stream'
          }
        });
        return new Response('Uploaded!', { status: 201 });
        
      case 'GET':
        const object = await env.MY_BUCKET.get(key);
        if (!object) {
          return new Response('Not found', { status: 404 });
        }
        return new Response(object.body, {
          headers: { 'content-type': object.httpMetadata?.contentType || '' }
        });
        
      default:
        return new Response('Method not allowed', { status: 405 });
    }
  }
}`,
    docsLink: 'https://developers.cloudflare.com/r2/api/workers/workers-api-reference/',
    bestPractices: [
      'Set appropriate content-type headers when uploading',
      'Implement proper error handling for missing objects',
      'Use multipart uploads for files > 100MB',
      'Consider using presigned URLs for client-side uploads'
    ]
  },

  {
    id: 'durable-object-binding-error',
    name: 'Durable Object Binding Error',
    category: 'binding-errors',
    severity: 'critical',
    patterns: [
      /durable.*object.*binding/i,
      /DurableObjectNamespace/i,
      /env\.\w+\.get\(/i,
      /cannot.*idFromName/i,
      /class.*not.*exported/i
    ],
    keywords: ['Durable Object', 'binding', 'namespace', 'idFromName', 'class'],
    rootCause: 'The Durable Object class is not exported from the main entry point, or the binding configuration in wrangler.toml doesn\'t match the exported class name.',
    suggestedFix: `1. Ensure DO class is exported from your main file
2. Verify class_name in wrangler.toml matches the export exactly
3. Add migrations for new DO classes
4. Check that idFromName/idFromString is called correctly`,
    codeExample: `// wrangler.toml
[durable_objects]
bindings = [
  { name = "COUNTER", class_name = "Counter" }
]

[[migrations]]
tag = "v1"
new_classes = ["Counter"]

// server.ts - MUST export the class
export class Counter extends DurableObject {
  private value: number = 0;
  
  async fetch(request: Request) {
    this.value++;
    return new Response(this.value.toString());
  }
}

// Using the DO in a worker
export default {
  async fetch(request, env) {
    // Get a unique ID based on a name
    const id = env.COUNTER.idFromName("global-counter");
    
    // Get the DO stub
    const stub = env.COUNTER.get(id);
    
    // Forward the request
    return stub.fetch(request);
  }
}`,
    docsLink: 'https://developers.cloudflare.com/durable-objects/get-started/',
    bestPractices: [
      'Always run migrations when adding new DO classes',
      'Export DO classes from your main entry file',
      'Use idFromName for stable IDs based on business logic',
      'Implement proper error handling in DO fetch methods'
    ]
  },

  // -------------------------------------------------------------------------
  // Network / Fetch Errors
  // -------------------------------------------------------------------------
  {
    id: 'cors-error',
    name: 'CORS Policy Error',
    category: 'security',
    severity: 'warning',
    patterns: [
      /cors/i,
      /access-control-allow-origin/i,
      /blocked by cors/i,
      /cross-origin/i,
      /preflight/i,
      /no 'access-control-allow-origin'/i
    ],
    keywords: ['CORS', 'cross-origin', 'preflight', 'OPTIONS', 'Access-Control'],
    rootCause: 'The Worker is not returning proper CORS headers, or is not handling OPTIONS preflight requests. Browsers block cross-origin requests without proper CORS headers.',
    suggestedFix: `1. Add CORS headers to all responses
2. Handle OPTIONS preflight requests
3. Set appropriate allowed origins (avoid * in production)
4. Include necessary headers in Access-Control-Allow-Headers`,
    codeExample: `// CORS headers configuration
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Or specific origin
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400', // Cache preflight for 24 hours
};

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // Your actual handler
    const response = await handleRequest(request, env);
    
    // Add CORS headers to the response
    const newHeaders = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      newHeaders.set(key, value);
    });
    
    return new Response(response.body, {
      status: response.status,
      headers: newHeaders
    });
  }
}

// For more control, use a helper function
function handleCors(request: Request, response: Response, allowedOrigins: string[]) {
  const origin = request.headers.get('Origin');
  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
  }
  return response;
}`,
    docsLink: 'https://developers.cloudflare.com/workers/examples/cors-header-proxy/',
    bestPractices: [
      'Use specific origins instead of * in production',
      'Cache preflight responses with Access-Control-Max-Age',
      'Only allow necessary HTTP methods and headers',
      'Consider using Cloudflare Access for authentication instead of CORS'
    ]
  },

  {
    id: 'fetch-failed',
    name: 'Fetch Request Failed',
    category: 'network-errors',
    severity: 'warning',
    patterns: [
      /fetch.*failed/i,
      /network.*error/i,
      /TypeError.*fetch/i,
      /failed to fetch/i,
      /ENOTFOUND/i,
      /ECONNREFUSED/i
    ],
    keywords: ['fetch', 'network', 'connection', 'refused', 'timeout'],
    rootCause: 'The fetch request to an external service failed. This could be due to DNS resolution failure, connection timeout, SSL certificate issues, or the target server being down.',
    suggestedFix: `1. Verify the URL is correct and accessible
2. Add timeout handling with AbortController
3. Implement retry logic with exponential backoff
4. Check if the target requires specific headers or auth
5. Ensure you're not hitting rate limits`,
    codeExample: `// Robust fetch with timeout and retry
async function fetchWithRetry(
  url: string, 
  options: RequestInit = {},
  retries = 3,
  timeout = 5000
): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok && attempt < retries) {
        // Retry on 5xx errors
        if (response.status >= 500) {
          await sleep(Math.pow(2, attempt) * 100); // Exponential backoff
          continue;
        }
      }
      
      return response;
    } catch (error) {
      if (attempt === retries) throw error;
      await sleep(Math.pow(2, attempt) * 100);
    }
  }
  throw new Error('Max retries exceeded');
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Usage
export default {
  async fetch(request, env) {
    try {
      const response = await fetchWithRetry('https://api.example.com/data', {
        headers: { 'Authorization': 'Bearer token' }
      });
      return response;
    } catch (error) {
      return Response.json({ error: 'External service unavailable' }, { status: 502 });
    }
  }
}`,
    docsLink: 'https://developers.cloudflare.com/workers/runtime-apis/fetch/',
    bestPractices: [
      'Always implement timeout handling',
      'Use retry logic with exponential backoff',
      'Cache responses when appropriate',
      'Monitor and alert on fetch failure rates'
    ]
  },

  // -------------------------------------------------------------------------
  // Configuration Errors
  // -------------------------------------------------------------------------
  {
    id: 'invalid-wrangler-config',
    name: 'Invalid Wrangler Configuration',
    category: 'configuration',
    severity: 'critical',
    patterns: [
      /wrangler\.toml/i,
      /configuration.*error/i,
      /invalid.*configuration/i,
      /missing.*required.*field/i,
      /failed to parse/i
    ],
    keywords: ['wrangler.toml', 'configuration', 'invalid', 'parse', 'required'],
    rootCause: 'The wrangler.toml file has syntax errors, missing required fields, or invalid values. This prevents deployment and local development.',
    suggestedFix: `1. Validate TOML syntax (check for typos, missing quotes)
2. Ensure all required fields are present
3. Verify binding IDs are correct UUIDs
4. Check compatibility_date is a valid date string
5. Run wrangler deploy --dry-run to validate`,
    codeExample: `# ✅ Correct wrangler.toml structure
name = "my-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

# ❌ Common mistakes:
# name = my-worker          # Missing quotes
# main = src/index.ts       # Correct (no quotes needed for paths)
# compatibility_date = 2024  # Wrong: needs full date string

# Bindings
[ai]
binding = "AI"

[[kv_namespaces]]
binding = "MY_KV"
id = "abc123..."  # Must be valid 32-char hex

[[d1_databases]]
binding = "DB"
database_name = "my-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # UUID format

[durable_objects]
bindings = [
  { name = "MY_DO", class_name = "MyDurableObject" }
]`,
    docsLink: 'https://developers.cloudflare.com/workers/wrangler/configuration/',
    bestPractices: [
      'Use wrangler deploy --dry-run to validate before deploying',
      'Keep wrangler.toml in version control',
      'Use environment-specific configurations with [env.production]',
      'Document all bindings with comments'
    ]
  },

  {
    id: 'env-variable-undefined',
    name: 'Environment Variable Not Found',
    category: 'configuration',
    severity: 'warning',
    patterns: [
      /env\.\w+.*undefined/i,
      /process\.env\.\w+.*undefined/i,
      /secret.*not.*found/i,
      /missing.*environment/i
    ],
    keywords: ['env', 'undefined', 'secret', 'variable', 'missing'],
    rootCause: 'An environment variable or secret is referenced in code but not defined in wrangler.toml [vars] section or set via wrangler secret.',
    suggestedFix: `1. For non-sensitive values, add to wrangler.toml [vars]
2. For secrets, use: wrangler secret put SECRET_NAME
3. For local dev, create .dev.vars file
4. Verify variable names match exactly (case-sensitive)`,
    codeExample: `# wrangler.toml - for non-sensitive config
[vars]
API_URL = "https://api.example.com"
MAX_RETRIES = "3"
DEBUG = "false"

# For secrets (API keys, tokens), use CLI:
# wrangler secret put API_KEY
# wrangler secret put DATABASE_URL

# .dev.vars - for local development (gitignored!)
API_KEY=sk-test-xxx
DATABASE_URL=postgresql://...

// worker.ts - accessing variables
export default {
  async fetch(request, env) {
    // Access vars and secrets from env
    const apiUrl = env.API_URL;
    const apiKey = env.API_KEY; // Secret
    
    // ❌ Don't use process.env in Workers
    // const key = process.env.API_KEY;
    
    // ✅ Always check if variable exists
    if (!env.API_KEY) {
      console.error('API_KEY not configured');
      return new Response('Server configuration error', { status: 500 });
    }
    
    return Response.json({ status: 'ok' });
  }
}`,
    docsLink: 'https://developers.cloudflare.com/workers/configuration/environment-variables/',
    bestPractices: [
      'Never commit secrets to version control',
      'Use .dev.vars for local secrets (add to .gitignore)',
      'Document required environment variables in README',
      'Validate required env vars at startup'
    ]
  },

  // -------------------------------------------------------------------------
  // API Errors
  // -------------------------------------------------------------------------
  {
    id: 'workers-ai-error',
    name: 'Workers AI Model Error',
    category: 'api-errors',
    severity: 'warning',
    patterns: [
      /workers.*ai.*error/i,
      /@cf\/.*model/i,
      /AI\.run.*failed/i,
      /model.*not.*found/i,
      /inference.*error/i
    ],
    keywords: ['Workers AI', 'AI.run', 'model', 'inference', 'Llama'],
    rootCause: 'The Workers AI request failed. This could be due to an invalid model name, malformed input, rate limiting, or the model being temporarily unavailable.',
    suggestedFix: `1. Verify model name is correct (check docs for available models)
2. Validate input format matches model requirements
3. Implement error handling and retries
4. Check Workers AI status for outages
5. Ensure AI binding is configured in wrangler.toml`,
    codeExample: `// wrangler.toml
[ai]
binding = "AI"

// worker.ts
export default {
  async fetch(request, env) {
    try {
      // Text generation example
      const response = await env.AI.run(
        '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
        {
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Hello!' }
          ],
          max_tokens: 256,
          temperature: 0.7
        }
      );
      
      return Response.json(response);
    } catch (error) {
      console.error('Workers AI Error:', error);
      
      // Handle specific error types
      if (error.message?.includes('rate limit')) {
        return Response.json(
          { error: 'Rate limited, please try again' },
          { status: 429 }
        );
      }
      
      return Response.json(
        { error: 'AI service temporarily unavailable' },
        { status: 503 }
      );
    }
  }
}

// Available model patterns:
// Text: @cf/meta/llama-3.3-70b-instruct-fp8-fast
// Embeddings: @cf/baai/bge-base-en-v1.5
// Image: @cf/stabilityai/stable-diffusion-xl-base-1.0`,
    docsLink: 'https://developers.cloudflare.com/workers-ai/models/',
    bestPractices: [
      'Use appropriate models for your use case',
      'Set reasonable max_tokens to control costs',
      'Implement streaming for long responses',
      'Cache AI responses when appropriate'
    ]
  },

  {
    id: 'script-too-large',
    name: 'Worker Script Size Limit Exceeded',
    category: 'runtime-limits',
    severity: 'critical',
    patterns: [
      /script.*too.*large/i,
      /size.*limit.*exceeded/i,
      /bundle.*size/i,
      /10.*MB.*limit/i,
      /worker.*size/i
    ],
    keywords: ['size', 'limit', 'bundle', 'large', 'MB', 'script'],
    rootCause: 'The Worker bundle exceeds the size limit (10MB compressed for free, 10MB for paid). This usually happens when bundling large dependencies or assets.',
    suggestedFix: `1. Analyze bundle with wrangler deploy --dry-run --outdir dist
2. Remove unused dependencies
3. Use dynamic imports for rarely-used code
4. Move static assets to R2 or CDN
5. Use code splitting where possible`,
    codeExample: `// Analyze what's in your bundle:
// wrangler deploy --dry-run --outdir dist

// Tips to reduce bundle size:

// ❌ Bad: Import entire library
import _ from 'lodash';
const result = _.pick(obj, ['a', 'b']);

// ✅ Good: Import only what you need
import pick from 'lodash/pick';
const result = pick(obj, ['a', 'b']);

// ❌ Bad: Embed large JSON data
import data from './huge-dataset.json';

// ✅ Good: Load from KV or R2
const data = await env.DATA_KV.get('dataset', 'json');

// ❌ Bad: Include all locales
import moment from 'moment';

// ✅ Good: Use lightweight alternatives
import { format } from 'date-fns';

// Use dynamic imports for optional features
const handler = await import('./optional-handler');`,
    docsLink: 'https://developers.cloudflare.com/workers/platform/limits/#worker-size',
    bestPractices: [
      'Regularly audit dependencies with npm ls or bundlephobia.com',
      'Use tree-shaking friendly imports',
      'Store large datasets in KV, R2, or D1',
      'Consider Workers for Platforms for multi-tenant apps'
    ]
  }
];

// =============================================================================
// Error Analysis Functions
// =============================================================================

/**
 * Calculate confidence score based on pattern matches and keyword hits
 */
function calculateConfidence(
  errorLog: string, 
  pattern: ErrorPattern
): number {
  let score = 0;
  const normalizedLog = errorLog.toLowerCase();
  
  // Check regex patterns (high weight)
  for (const regex of pattern.patterns) {
    if (regex.test(errorLog)) {
      score += 0.3;
    }
  }
  
  // Check keywords (lower weight)
  for (const keyword of pattern.keywords) {
    if (normalizedLog.includes(keyword.toLowerCase())) {
      score += 0.1;
    }
  }
  
  // Cap at 1.0
  return Math.min(score, 1.0);
}

/**
 * Find matching error patterns for the given error log
 */
function findMatchingPatterns(errorLog: string): Array<{
  pattern: ErrorPattern;
  confidence: number;
}> {
  const matches: Array<{ pattern: ErrorPattern; confidence: number }> = [];
  
  for (const pattern of ERROR_PATTERNS) {
    const confidence = calculateConfidence(errorLog, pattern);
    if (confidence >= 0.2) {
      matches.push({ pattern, confidence });
    }
  }
  
  // Sort by confidence (highest first)
  matches.sort((a, b) => b.confidence - a.confidence);
  
  return matches;
}

/**
 * Convert an error pattern to an analysis result
 */
function patternToResult(
  pattern: ErrorPattern,
  confidence: number
): ErrorAnalysisResult {
  return {
    errorType: pattern.name,
    category: pattern.category,
    severity: pattern.severity,
    rootCause: pattern.rootCause,
    suggestedFix: pattern.suggestedFix,
    codeExample: pattern.codeExample,
    docsLink: pattern.docsLink,
    bestPractices: pattern.bestPractices,
    confidence
  };
}

/**
 * Main function to analyze Cloudflare Worker error logs
 * 
 * @param errorLog - The error log string to analyze (stack trace, console output, etc.)
 * @returns Analysis result with identified error type, cause, and fix
 * 
 * @example
 * ```typescript
 * const result = analyzeCloudflareErrorFn("Error 1102: Worker exceeded CPU time limit");
 * console.log(result.suggestedFix);
 * ```
 */
export function analyzeCloudflareErrorFn(errorLog: string): ErrorAnalysisResult {
  if (!errorLog || errorLog.trim().length === 0) {
    return {
      errorType: 'Empty Error Log',
      category: 'unknown',
      severity: 'info',
      rootCause: 'No error log was provided for analysis.',
      suggestedFix: 'Please provide the complete error log, including any stack traces or console output.',
      confidence: 0
    };
  }
  
  const matches = findMatchingPatterns(errorLog);
  
  if (matches.length === 0) {
    return {
      errorType: 'Unrecognized Error',
      category: 'unknown',
      severity: 'warning',
      rootCause: 'This error pattern is not in our database. It may be a custom application error or a new Cloudflare error type.',
      suggestedFix: `1. Check the Cloudflare Workers status page for outages
2. Search the Cloudflare Discord community for similar errors
3. Review the stack trace for application-specific issues
4. Check wrangler logs for more context: wrangler tail`,
      docsLink: 'https://developers.cloudflare.com/workers/observability/logging/',
      bestPractices: [
        'Use structured logging (console.log(JSON.stringify(data)))',
        'Add error boundaries with try/catch blocks',
        'Enable wrangler tail for real-time logs',
        'Consider using Cloudflare Logpush for production debugging'
      ],
      confidence: 0
    };
  }
  
  // Return the highest confidence match
  const bestMatch = matches[0];
  return patternToResult(bestMatch.pattern, bestMatch.confidence);
}

/**
 * Analyze multiple error logs at once
 */
export function analyzeMultipleErrors(errorLogs: string[]): ErrorAnalysisResult[] {
  return errorLogs.map(log => analyzeCloudflareErrorFn(log));
}

/**
 * Get all known error patterns (for documentation/UI purposes)
 */
export function getKnownErrorPatterns(): Array<{
  id: string;
  name: string;
  category: CloudflareErrorCategory;
  severity: ErrorSeverity;
}> {
  return ERROR_PATTERNS.map(p => ({
    id: p.id,
    name: p.name,
    category: p.category,
    severity: p.severity
  }));
}

// =============================================================================
// AI Tool Definition
// =============================================================================

/**
 * Zod schema for the error analysis input
 */
const analyzeCloudflareErrorSchema = z.object({
  errorLog: z.string().describe(
    'The error log to analyze. Can include stack traces, error messages, Worker console output, or wrangler deployment errors.'
  ),
  includeCodeExamples: z.boolean().optional().default(true).describe(
    'Whether to include code examples in the response'
  )
});

/**
 * AI Tool: Analyze Cloudflare Worker errors and provide debugging guidance
 * 
 * This tool can be used by the AI assistant to automatically analyze
 * error logs and provide specific, actionable fixes.
 */
export const analyzeCloudflareError = tool({
  description: `Analyze Cloudflare Worker error logs and provide specific debugging guidance. 
This tool identifies common Cloudflare-specific errors including:
- Runtime limits (CPU time, memory, subrequests)
- Binding errors (KV, D1, R2, Durable Objects)
- Network/fetch failures
- CORS issues
- Configuration problems
- Workers AI errors

Provide the complete error log for best results.`,
  inputSchema: analyzeCloudflareErrorSchema,
  execute: async ({ errorLog, includeCodeExamples }) => {
    const result = analyzeCloudflareErrorFn(errorLog);
    
    // Format response for the AI
    let response = `## Error Analysis: ${result.errorType}

**Severity:** ${result.severity.toUpperCase()}
**Category:** ${result.category}
**Confidence:** ${Math.round(result.confidence * 100)}%

### Root Cause
${result.rootCause}

### Suggested Fix
${result.suggestedFix}`;

    if (includeCodeExamples && result.codeExample) {
      response += `

### Code Example
\`\`\`typescript
${result.codeExample}
\`\`\``;
    }

    if (result.docsLink) {
      response += `

### Documentation
${result.docsLink}`;
    }

    if (result.bestPractices && result.bestPractices.length > 0) {
      response += `

### Best Practices
${result.bestPractices.map(bp => `- ${bp}`).join('\n')}`;
    }

    return response;
  }
});
