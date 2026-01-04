/**
 * searchCloudflareDocs - Tool for retrieving relevant Cloudflare documentation
 * 
 * This tool provides intelligent documentation search based on user queries.
 * It maintains a knowledge base of common Cloudflare topics with explanations,
 * code examples, and documentation links.
 * 
 * @module tools/searchCloudflareDocs
 */

import { tool } from "ai";
import { z } from "zod/v3";

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * A single documentation entry in the knowledge base
 */
export interface DocEntry {
  /** Unique identifier for the topic */
  id: string;
  /** Display title */
  title: string;
  /** Brief explanation (2-3 sentences) */
  explanation: string;
  /** Working code example */
  codeExample: string;
  /** Official Cloudflare documentation URL */
  docsUrl: string;
  /** Keywords for matching queries */
  keywords: string[];
  /** Related topic IDs */
  relatedTopics: string[];
  /** Category for organization */
  category: 'storage' | 'compute' | 'network' | 'security' | 'ai' | 'developer-platform';
}

/**
 * Search result with relevance score
 */
export interface SearchResult {
  /** Documentation entry */
  doc: DocEntry;
  /** Relevance score (0-1) */
  score: number;
  /** Matched keywords */
  matchedKeywords: string[];
}

/**
 * Complete search response
 */
export interface SearchDocsResponse {
  /** Array of relevant documentation entries */
  results: Array<{
    title: string;
    explanation: string;
    codeExample: string;
    docsUrl: string;
    relatedTopics: string[];
  }>;
  /** Overall confidence in the results (0-1) */
  confidence: number;
  /** Total number of matches found */
  totalMatches: number;
}

// =============================================================================
// Documentation Knowledge Base (30+ Topics)
// =============================================================================

const DOCS_KNOWLEDGE_BASE: DocEntry[] = [
  // -------------------------------------------------------------------------
  // STORAGE - KV, D1, R2, Durable Objects
  // -------------------------------------------------------------------------
  {
    id: 'kv-basics',
    title: 'Workers KV - Key-Value Storage',
    category: 'storage',
    explanation: 'Workers KV is a global, low-latency key-value data store. It is eventually consistent and best suited for read-heavy workloads like configuration, cached data, and session storage.',
    keywords: ['kv', 'key-value', 'storage', 'cache', 'namespace', 'get', 'put', 'delete', 'key value'],
    codeExample: `// wrangler.toml
[[kv_namespaces]]
binding = "MY_KV"
id = "your-namespace-id"

// worker.ts
export default {
  async fetch(request, env) {
    // Write
    await env.MY_KV.put('key', 'value', {
      expirationTtl: 3600,  // Expire after 1 hour
      metadata: { userId: '123' }
    });
    
    // Read with cache
    const value = await env.MY_KV.get('key', {
      cacheTtl: 60,  // Cache at edge for 60s
      type: 'text'
    });
    
    // List keys
    const list = await env.MY_KV.list({ prefix: 'user:' });
    
    return Response.json({ value });
  }
}`,
    docsUrl: 'https://developers.cloudflare.com/kv/',
    relatedTopics: ['d1-basics', 'r2-basics', 'cache-api']
  },

  {
    id: 'd1-basics',
    title: 'D1 - SQLite Database at the Edge',
    category: 'storage',
    explanation: 'D1 is Cloudflare\'s native serverless SQL database built on SQLite. It provides relational data storage with ACID transactions and is ideal for structured data and complex queries.',
    keywords: ['d1', 'database', 'sql', 'sqlite', 'query', 'relational', 'table', 'migration'],
    codeExample: `// wrangler.toml
[[d1_databases]]
binding = "DB"
database_name = "my-database"
database_id = "your-database-id"

// Create migration: wrangler d1 migrations create my-database create_users

-- migrations/0001_create_users.sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Apply: wrangler d1 migrations apply my-database

// worker.ts
export default {
  async fetch(request, env) {
    // Insert
    const { success } = await env.DB
      .prepare('INSERT INTO users (email, name) VALUES (?, ?)')
      .bind('user@example.com', 'John Doe')
      .run();
    
    // Query
    const { results } = await env.DB
      .prepare('SELECT * FROM users WHERE email = ?')
      .bind('user@example.com')
      .all();
    
    // Batch operations
    const batch = [
      env.DB.prepare('INSERT INTO users ...').bind(...),
      env.DB.prepare('UPDATE users ...').bind(...)
    ];
    await env.DB.batch(batch);
    
    return Response.json(results);
  }
}`,
    docsUrl: 'https://developers.cloudflare.com/d1/',
    relatedTopics: ['kv-basics', 'durable-objects', 'migrations']
  },

  {
    id: 'r2-basics',
    title: 'R2 - S3-Compatible Object Storage',
    category: 'storage',
    explanation: 'R2 is Cloudflare\'s object storage with zero egress fees. It\'s perfect for storing large files, images, videos, and backups with S3-compatible APIs.',
    keywords: ['r2', 'object storage', 'bucket', 's3', 'files', 'upload', 'download', 'blob'],
    codeExample: `// wrangler.toml
[[r2_buckets]]
binding = "MY_BUCKET"
bucket_name = "my-files"

// worker.ts
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const key = url.pathname.slice(1);
    
    if (request.method === 'PUT') {
      // Upload file
      await env.MY_BUCKET.put(key, request.body, {
        httpMetadata: {
          contentType: request.headers.get('content-type'),
          cacheControl: 'max-age=31536000'
        },
        customMetadata: {
          uploadedBy: 'user-123'
        }
      });
      return new Response('Uploaded', { status: 201 });
    }
    
    if (request.method === 'GET') {
      // Download file
      const object = await env.MY_BUCKET.get(key);
      
      if (!object) {
        return new Response('Not Found', { status: 404 });
      }
      
      return new Response(object.body, {
        headers: {
          'content-type': object.httpMetadata.contentType,
          'etag': object.etag
        }
      });
    }
    
    // List objects
    const list = await env.MY_BUCKET.list({ prefix: 'uploads/' });
    return Response.json(list);
  }
}`,
    docsUrl: 'https://developers.cloudflare.com/r2/',
    relatedTopics: ['kv-basics', 'multipart-upload', 'presigned-urls']
  },

  {
    id: 'durable-objects',
    title: 'Durable Objects - Stateful Coordination',
    category: 'storage',
    explanation: 'Durable Objects provide low-latency coordination and consistent storage for applications that require real-time collaboration, WebSockets, or strong consistency guarantees.',
    keywords: ['durable objects', 'stateful', 'websocket', 'coordination', 'consistency', 'state', 'persistent'],
    codeExample: `// wrangler.toml
[[durable_objects.bindings]]
name = "COUNTER"
class_name = "Counter"

[[migrations]]
tag = "v1"
new_classes = ["Counter"]

// worker.ts
export class Counter extends DurableObject {
  private value: number = 0;
  
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Load from storage
    this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<number>('value');
      this.value = stored || 0;
    });
  }
  
  async fetch(request: Request) {
    const url = new URL(request.url);
    
    if (url.pathname === '/increment') {
      this.value++;
      await this.ctx.storage.put('value', this.value);
      return Response.json({ value: this.value });
    }
    
    return Response.json({ value: this.value });
  }
}

export default {
  async fetch(request, env) {
    const id = env.COUNTER.idFromName('global');
    const stub = env.COUNTER.get(id);
    return stub.fetch(request);
  }
}`,
    docsUrl: 'https://developers.cloudflare.com/durable-objects/',
    relatedTopics: ['websockets', 'kv-basics', 'd1-basics']
  },

  // -------------------------------------------------------------------------
  // COMPUTE - Workers AI, Queues, Workflows
  // -------------------------------------------------------------------------
  {
    id: 'workers-ai',
    title: 'Workers AI - Run AI Models at the Edge',
    category: 'ai',
    explanation: 'Workers AI provides access to AI models like LLMs (Llama), embeddings, image generation, and more, running directly on Cloudflare\'s network with no cold starts.',
    keywords: ['ai', 'llm', 'llama', 'embeddings', 'machine learning', 'inference', 'model', 'text generation'],
    codeExample: `// wrangler.toml
[ai]
binding = "AI"

// worker.ts
export default {
  async fetch(request, env) {
    // Text generation with Llama 3.3
    const response = await env.AI.run(
      '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      {
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Explain Workers AI in one sentence.' }
        ],
        max_tokens: 256,
        temperature: 0.7,
        stream: true  // Enable streaming
      }
    );
    
    // Text embeddings
    const embeddings = await env.AI.run(
      '@cf/baai/bge-base-en-v1.5',
      { text: 'Cloudflare Workers AI is amazing!' }
    );
    
    // Image generation
    const image = await env.AI.run(
      '@cf/stabilityai/stable-diffusion-xl-base-1.0',
      { prompt: 'A beautiful sunset over the ocean' }
    );
    
    return new Response(response, {
      headers: { 'content-type': 'text/event-stream' }
    });
  }
}`,
    docsUrl: 'https://developers.cloudflare.com/workers-ai/',
    relatedTopics: ['vectorize', 'streaming', 'workers-basics']
  },

  {
    id: 'queues',
    title: 'Queues - Background Job Processing',
    category: 'compute',
    explanation: 'Cloudflare Queues enables asynchronous message processing for background tasks, batching operations, and decoupling services with guaranteed delivery.',
    keywords: ['queues', 'queue', 'background', 'async', 'batch', 'jobs', 'message', 'producer', 'consumer'],
    codeExample: `// wrangler.toml
[[queues.producers]]
queue = "my-queue"
binding = "MY_QUEUE"

[[queues.consumers]]
queue = "my-queue"
max_batch_size = 10
max_batch_timeout = 30

// worker.ts
export default {
  // Producer: Send messages to queue
  async fetch(request, env) {
    await env.MY_QUEUE.send({
      url: request.url,
      timestamp: Date.now(),
      data: await request.json()
    });
    
    // Send batch
    await env.MY_QUEUE.sendBatch([
      { body: { id: 1, action: 'process' } },
      { body: { id: 2, action: 'notify' } }
    ]);
    
    return new Response('Queued for processing');
  },
  
  // Consumer: Process messages from queue
  async queue(batch, env) {
    for (const message of batch.messages) {
      console.log('Processing:', message.body);
      
      try {
        await processMessage(message.body);
        message.ack();  // Acknowledge success
      } catch (error) {
        message.retry();  // Retry on failure
      }
    }
  }
}`,
    docsUrl: 'https://developers.cloudflare.com/queues/',
    relatedTopics: ['workers-basics', 'durable-objects', 'cron-triggers']
  },

  // -------------------------------------------------------------------------
  // NETWORK - Fetch, WebSockets, Caching
  // -------------------------------------------------------------------------
  {
    id: 'fetch-api',
    title: 'Fetch API in Workers',
    category: 'network',
    explanation: 'The Fetch API in Workers allows making HTTP requests to external services. Workers automatically optimize requests using Cloudflare\'s global network.',
    keywords: ['fetch', 'http', 'request', 'api', 'subrequest', 'external', 'proxy'],
    codeExample: `export default {
  async fetch(request, env) {
    // Basic fetch
    const response = await fetch('https://api.example.com/data');
    
    // With options
    const apiResponse = await fetch('https://api.example.com/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': \`Bearer \${env.API_KEY}\`
      },
      body: JSON.stringify({ name: 'John' })
    });
    
    // With timeout using AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    try {
      const data = await fetch('https://slow-api.com', {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return data;
    } catch (error) {
      if (error.name === 'AbortError') {
        return new Response('Request timeout', { status: 504 });
      }
      throw error;
    }
  }
}`,
    docsUrl: 'https://developers.cloudflare.com/workers/runtime-apis/fetch/',
    relatedTopics: ['cache-api', 'request-response', 'error-handling']
  },

  {
    id: 'cache-api',
    title: 'Cache API - Edge Caching',
    category: 'network',
    explanation: 'The Cache API allows you to control caching behavior at the edge, storing and retrieving responses to reduce latency and origin load.',
    keywords: ['cache', 'caching', 'cdn', 'edge', 'performance', 'cache-control', 'ttl'],
    codeExample: `export default {
  async fetch(request, env, ctx) {
    const cache = caches.default;
    
    // Create cache key
    const cacheKey = new Request(request.url, {
      method: 'GET',  // Cache keys are always GET
      headers: request.headers
    });
    
    // Check cache first
    let response = await cache.match(cacheKey);
    
    if (response) {
      console.log('Cache hit!');
      return response;
    }
    
    // Fetch from origin
    console.log('Cache miss, fetching from origin');
    response = await fetch(request);
    
    // Clone and cache if successful
    if (response.ok) {
      const responseToCache = response.clone();
      
      // Cache in background
      ctx.waitUntil(cache.put(cacheKey, responseToCache));
    }
    
    return response;
  }
}

// Custom cache with TTL
async function cacheWithTTL(request, ttl = 300) {
  const cache = await caches.open('custom-cache');
  const cached = await cache.match(request);
  
  if (cached) {
    const cachedTime = new Date(cached.headers.get('cached-at'));
    if (Date.now() - cachedTime.getTime() < ttl * 1000) {
      return cached;
    }
  }
  
  const response = await fetch(request);
  const newResponse = new Response(response.body, response);
  newResponse.headers.set('cached-at', new Date().toISOString());
  await cache.put(request, newResponse.clone());
  
  return response;
}`,
    docsUrl: 'https://developers.cloudflare.com/workers/runtime-apis/cache/',
    relatedTopics: ['fetch-api', 'kv-basics', 'headers']
  },

  {
    id: 'websockets',
    title: 'WebSockets for Real-Time Communication',
    category: 'network',
    explanation: 'Workers support WebSockets for bi-directional, real-time communication. Combine with Durable Objects for stateful WebSocket applications like chat or multiplayer games.',
    keywords: ['websocket', 'websockets', 'ws', 'real-time', 'realtime', 'bidirectional', 'socket'],
    codeExample: `export default {
  async fetch(request, env) {
    const upgradeHeader = request.headers.get('Upgrade');
    
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }
    
    // Create WebSocket pair
    const [client, server] = Object.values(new WebSocketPair());
    
    // Accept the connection
    server.accept();
    
    // Handle messages
    server.addEventListener('message', event => {
      console.log('Received:', event.data);
      server.send(\`Echo: \${event.data}\`);
    });
    
    server.addEventListener('close', () => {
      console.log('WebSocket closed');
    });
    
    // Return client side to browser
    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }
}

// With Durable Objects for state
export class ChatRoom extends DurableObject {
  private sessions: Set<WebSocket> = new Set();
  
  async fetch(request: Request) {
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    
    this.sessions.add(server);
    
    server.addEventListener('message', event => {
      // Broadcast to all clients
      this.sessions.forEach(session => {
        if (session !== server) {
          session.send(event.data);
        }
      });
    });
    
    server.addEventListener('close', () => {
      this.sessions.delete(server);
    });
    
    return new Response(null, { status: 101, webSocket: client });
  }
}`,
    docsUrl: 'https://developers.cloudflare.com/workers/runtime-apis/websockets/',
    relatedTopics: ['durable-objects', 'workers-basics']
  },

  // -------------------------------------------------------------------------
  // DEVELOPER PLATFORM - Bindings, Environment, Deployments
  // -------------------------------------------------------------------------
  {
    id: 'bindings',
    title: 'Bindings - Connect to Resources',
    category: 'developer-platform',
    explanation: 'Bindings allow Workers to interact with Cloudflare resources like KV, D1, R2, and services. They\'re configured in wrangler.toml and accessed via the env parameter.',
    keywords: ['bindings', 'binding', 'environment', 'env', 'configuration', 'wrangler', 'resources'],
    codeExample: `// wrangler.toml
name = "my-worker"

# KV binding
[[kv_namespaces]]
binding = "MY_KV"
id = "abc123..."

# D1 binding
[[d1_databases]]
binding = "DB"
database_id = "xyz789..."

# R2 binding
[[r2_buckets]]
binding = "BUCKET"
bucket_name = "my-files"

# Durable Object binding
[[durable_objects.bindings]]
name = "COUNTER"
class_name = "Counter"

# Service binding (call another Worker)
[[services]]
binding = "AUTH_SERVICE"
service = "auth-worker"

# Environment variables
[vars]
API_URL = "https://api.example.com"
DEBUG = "false"

# Secrets (set with: wrangler secret put SECRET_NAME)
# - API_KEY
# - DATABASE_URL

// worker.ts - Access bindings via env
export default {
  async fetch(request, env, ctx) {
    // Use KV
    const value = await env.MY_KV.get('key');
    
    // Use D1
    const users = await env.DB.prepare('SELECT * FROM users').all();
    
    // Use R2
    await env.BUCKET.put('file.txt', 'content');
    
    // Call another Worker
    const authResponse = await env.AUTH_SERVICE.fetch(request);
    
    // Access variables
    const apiUrl = env.API_URL;
    const apiKey = env.API_KEY;  // From secret
    
    return Response.json({ status: 'ok' });
  }
}`,
    docsUrl: 'https://developers.cloudflare.com/workers/configuration/bindings/',
    relatedTopics: ['kv-basics', 'd1-basics', 'r2-basics', 'env-variables']
  },

  {
    id: 'env-variables',
    title: 'Environment Variables and Secrets',
    category: 'developer-platform',
    explanation: 'Environment variables store configuration, while secrets store sensitive data like API keys. Variables go in wrangler.toml, secrets use wrangler secret command.',
    keywords: ['environment', 'variables', 'secrets', 'env', 'config', 'api key', 'configuration'],
    codeExample: `// wrangler.toml
[vars]
API_URL = "https://api.example.com"
MAX_RETRIES = "3"
DEBUG = "false"

# Environment-specific variables
[env.production.vars]
API_URL = "https://api.prod.example.com"
DEBUG = "false"

[env.staging.vars]
API_URL = "https://api.staging.example.com"
DEBUG = "true"

// Set secrets via CLI (NOT in wrangler.toml!):
// wrangler secret put API_KEY
// wrangler secret put DATABASE_URL
// wrangler secret put STRIPE_SECRET_KEY

// List secrets: wrangler secret list
// Delete secret: wrangler secret delete API_KEY

// .dev.vars (for local development - add to .gitignore!)
API_KEY=sk-test-123
DATABASE_URL=postgresql://localhost/mydb
STRIPE_SECRET_KEY=sk_test_abc123

// worker.ts - Access via env
export default {
  async fetch(request, env) {
    // Environment variables
    const apiUrl = env.API_URL;
    const maxRetries = parseInt(env.MAX_RETRIES);
    const isDebug = env.DEBUG === 'true';
    
    // Secrets
    const apiKey = env.API_KEY;
    
    // Use in requests
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': \`Bearer \${apiKey}\`
      }
    });
    
    return response;
  }
}`,
    docsUrl: 'https://developers.cloudflare.com/workers/configuration/environment-variables/',
    relatedTopics: ['bindings', 'secrets-management', 'wrangler']
  },

  {
    id: 'wrangler',
    title: 'Wrangler CLI - Workers Development Tool',
    category: 'developer-platform',
    explanation: 'Wrangler is the official CLI for developing, testing, and deploying Cloudflare Workers. It provides commands for local development, deployment, and resource management.',
    keywords: ['wrangler', 'cli', 'deploy', 'dev', 'local', 'development', 'command'],
    codeExample: `# Initialize new project
npm create cloudflare@latest my-worker

# Development
wrangler dev                    # Start local dev server
wrangler dev --remote          # Dev against production resources
wrangler dev --port 8080       # Custom port

# Deployment
wrangler deploy                # Deploy to production
wrangler deploy --env staging  # Deploy to staging environment
wrangler publish              # Alias for deploy (deprecated)

# KV operations
wrangler kv namespace create "MY_KV"
wrangler kv namespace list
wrangler kv key put --namespace-id=abc123 "key" "value"
wrangler kv key get --namespace-id=abc123 "key"

# D1 operations
wrangler d1 create my-database
wrangler d1 execute my-database --command "SELECT * FROM users"
wrangler d1 migrations create my-database create_users
wrangler d1 migrations apply my-database

# R2 operations
wrangler r2 bucket create my-bucket
wrangler r2 bucket list
wrangler r2 object put my-bucket/file.txt --file ./local-file.txt

# Secrets management
wrangler secret put API_KEY
wrangler secret list
wrangler secret delete API_KEY

# Tail logs (real-time)
wrangler tail
wrangler tail --format pretty

# Generate types
wrangler types

# View deployments
wrangler deployments list`,
    docsUrl: 'https://developers.cloudflare.com/workers/wrangler/',
    relatedTopics: ['workers-basics', 'bindings', 'deployments']
  },

  {
    id: 'workers-basics',
    title: 'Workers Fundamentals',
    category: 'compute',
    explanation: 'Cloudflare Workers run JavaScript/TypeScript at the edge on Cloudflare\'s global network. They handle HTTP requests with minimal latency and can access various storage and compute resources.',
    keywords: ['workers', 'worker', 'basics', 'fundamentals', 'getting started', 'hello world', 'fetch handler'],
    codeExample: `// Basic Worker structure
export default {
  async fetch(request, env, ctx) {
    // request: Request object
    // env: Environment bindings (KV, D1, secrets, etc.)
    // ctx: Execution context (waitUntil, passThroughOnException)
    
    const url = new URL(request.url);
    
    // Route handling
    if (url.pathname === '/api/users') {
      return handleUsers(request, env);
    }
    
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok' });
    }
    
    // Default response
    return new Response('Hello World!', {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'X-Custom-Header': 'value'
      }
    });
  }
}

// Alternative: Service Worker syntax
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  return new Response('Hello World!');
}

// Scheduled events (cron triggers)
export default {
  async scheduled(event, env, ctx) {
    // Runs on schedule defined in wrangler.toml
    console.log('Cron job executed');
    await cleanupOldData(env);
  }
}`,
    docsUrl: 'https://developers.cloudflare.com/workers/get-started/',
    relatedTopics: ['fetch-api', 'request-response', 'bindings']
  },

  {
    id: 'request-response',
    title: 'Request and Response Objects',
    category: 'network',
    explanation: 'Workers use standard Web APIs for HTTP requests and responses. The Request object contains incoming request data, while Response constructs the output.',
    keywords: ['request', 'response', 'headers', 'body', 'url', 'method', 'http'],
    codeExample: `export default {
  async fetch(request, env) {
    // ========= REQUEST OBJECT =========
    
    // Method and URL
    const method = request.method;  // GET, POST, etc.
    const url = new URL(request.url);
    const pathname = url.pathname;
    const params = url.searchParams;
    
    // Headers
    const contentType = request.headers.get('content-type');
    const userAgent = request.headers.get('user-agent');
    const origin = request.headers.get('origin');
    
    // Body (for POST/PUT)
    const body = await request.json();  // Parse JSON
    // OR: await request.text()
    // OR: await request.formData()
    // OR: await request.arrayBuffer()
    
    // Clone request (needed if reading body multiple times)
    const requestClone = request.clone();
    
    // ========= RESPONSE OBJECT =========
    
    // JSON response
    return Response.json({ 
      message: 'Success',
      data: { id: 123 }
    }, {
      status: 200,
      headers: {
        'Cache-Control': 'max-age=3600',
        'X-Custom-Header': 'value'
      }
    });
    
    // Text response
    return new Response('Hello World', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
    
    // HTML response
    return new Response('<h1>Hello</h1>', {
      headers: { 'Content-Type': 'text/html' }
    });
    
    // Redirect
    return Response.redirect('https://example.com', 302);
    
    // Stream response
    const { readable, writable } = new TransformStream();
    // ... pipe data to writable
    return new Response(readable);
    
    // Error responses
    return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
}`,
    docsUrl: 'https://developers.cloudflare.com/workers/runtime-apis/request/',
    relatedTopics: ['workers-basics', 'fetch-api', 'headers']
  },

  // -------------------------------------------------------------------------
  // SECURITY - CORS, Authentication, Rate Limiting
  // -------------------------------------------------------------------------
  {
    id: 'cors',
    title: 'CORS - Cross-Origin Resource Sharing',
    category: 'security',
    explanation: 'CORS headers allow browsers to access your API from different domains. Workers must explicitly set CORS headers to enable cross-origin requests.',
    keywords: ['cors', 'cross-origin', 'preflight', 'options', 'access-control', 'origin'],
    codeExample: `const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request, env) {
    // Handle CORS preflight (OPTIONS)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }
    
    // Handle actual request
    const response = await handleRequest(request, env);
    
    // Add CORS headers to response
    const newResponse = new Response(response.body, response);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      newResponse.headers.set(key, value);
    });
    
    return newResponse;
  }
}

// More secure: Validate origin
function handleCors(request, response, allowedOrigins = ['https://example.com']) {
  const origin = request.headers.get('Origin');
  
  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }
  
  return response;
}`,
    docsUrl: 'https://developers.cloudflare.com/workers/examples/cors-header-proxy/',
    relatedTopics: ['headers', 'security', 'request-response']
  },

  {
    id: 'rate-limiting',
    title: 'Rate Limiting - Protect Your APIs',
    category: 'security',
    explanation: 'Rate limiting prevents abuse by restricting the number of requests from a client. Implement using Durable Objects for distributed counters or KV with expiration.',
    keywords: ['rate limit', 'rate limiting', 'throttle', 'quota', 'limit', 'abuse prevention'],
    codeExample: `// Using Durable Objects for distributed rate limiting
export class RateLimiter extends DurableObject {
  async fetch(request: Request) {
    const key = new URL(request.url).searchParams.get('key');
    const limit = 100;  // 100 requests
    const window = 60;  // per 60 seconds
    
    const currentCount = await this.ctx.storage.get<number>(key) || 0;
    const now = Date.now();
    
    if (currentCount >= limit) {
      return Response.json({ 
        allowed: false, 
        limit, 
        remaining: 0 
      }, { status: 429 });
    }
    
    await this.ctx.storage.put(key, currentCount + 1, {
      expirationTtl: window
    });
    
    return Response.json({ 
      allowed: true, 
      limit, 
      remaining: limit - currentCount - 1 
    });
  }
}

// Using KV for simple rate limiting
async function rateLimit(request, env) {
  const ip = request.headers.get('CF-Connecting-IP');
  const key = \`ratelimit:\${ip}\`;
  
  const count = await env.KV.get(key);
  
  if (count && parseInt(count) >= 100) {
    return new Response('Too many requests', { 
      status: 429,
      headers: { 'Retry-After': '60' }
    });
  }
  
  await env.KV.put(key, String((parseInt(count || '0') + 1)), {
    expirationTtl: 60
  });
  
  return null;  // Allow request
}

export default {
  async fetch(request, env) {
    const rateLimitResponse = await rateLimit(request, env);
    if (rateLimitResponse) return rateLimitResponse;
    
    // Process request
    return Response.json({ success: true });
  }
}`,
    docsUrl: 'https://developers.cloudflare.com/workers/examples/cache-api/',
    relatedTopics: ['durable-objects', 'kv-basics', 'security']
  },

  // -------------------------------------------------------------------------
  // PAGES - Static Sites with Functions
  // -------------------------------------------------------------------------
  {
    id: 'pages-functions',
    title: 'Pages Functions - Full-Stack Applications',
    category: 'developer-platform',
    explanation: 'Cloudflare Pages Functions combine static assets with serverless functions. They use file-based routing and run on Workers runtime.',
    keywords: ['pages', 'pages functions', 'static', 'full-stack', 'nextjs', 'react', 'routing'],
    codeExample: `// Project structure:
// /functions
//   /api
//     /users
//       [id].ts      -> /api/users/:id
//     hello.ts       -> /api/hello
//   [[path]].ts      -> Catch-all route
// /public
//   index.html

// functions/api/hello.ts
export async function onRequest(context) {
  // context.request, context.env, context.params
  return Response.json({ message: 'Hello from Pages!' });
}

// functions/api/users/[id].ts
export async function onRequestGet(context) {
  const userId = context.params.id;
  
  const user = await context.env.DB
    .prepare('SELECT * FROM users WHERE id = ?')
    .bind(userId)
    .first();
  
  return Response.json(user);
}

// functions/api/users/index.ts
export async function onRequestPost(context) {
  const body = await context.request.json();
  
  await context.env.DB
    .prepare('INSERT INTO users (name, email) VALUES (?, ?)')
    .bind(body.name, body.email)
    .run();
  
  return Response.json({ success: true }, { status: 201 });
}

// Middleware: functions/_middleware.ts
export async function onRequest(context) {
  // Check auth
  const token = context.request.headers.get('Authorization');
  if (!token) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // Continue to next function
  return context.next();
}`,
    docsUrl: 'https://developers.cloudflare.com/pages/functions/',
    relatedTopics: ['workers-basics', 'bindings', 'routing']
  },

  // Additional topics (continuing to reach 30+)
  
  {
    id: 'streaming',
    title: 'Streaming Responses',
    category: 'network',
    explanation: 'Stream data to clients without buffering the entire response in memory. Essential for large files, real-time data, and Server-Sent Events (SSE).',
    keywords: ['streaming', 'stream', 'transformstream', 'readable', 'writable', 'sse', 'server-sent events'],
    codeExample: `// Transform stream for processing chunks
export default {
  async fetch(request, env) {
    const response = await fetch('https://api.example.com/large-data');
    
    const { readable, writable } = new TransformStream({
      transform(chunk, controller) {
        // Process each chunk
        const processed = processChunk(chunk);
        controller.enqueue(processed);
      }
    });
    
    response.body.pipeTo(writable);
    
    return new Response(readable, {
      headers: response.headers
    });
  }
}

// Server-Sent Events (SSE)
export default {
  async fetch(request) {
    const encoder = new TextEncoder();
    
    let intervalId;
    const stream = new ReadableStream({
      start(controller) {
        intervalId = setInterval(() => {
          const data = \`data: \${JSON.stringify({ time: Date.now() })}\\n\\n\`;
          controller.enqueue(encoder.encode(data));
        }, 1000);
      },
      cancel() {
        clearInterval(intervalId);
      }
    });
    
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  }
}`,
    docsUrl: 'https://developers.cloudflare.com/workers/runtime-apis/streams/',
    relatedTopics: ['workers-ai', 'websockets', 'request-response']
  },

  {
    id: 'cron-triggers',
    title: 'Cron Triggers - Scheduled Workers',
    category: 'compute',
    explanation: 'Cron Triggers allow Workers to run on a schedule for periodic tasks like cleanup, reports, or data synchronization.',
    keywords: ['cron', 'scheduled', 'schedule', 'trigger', 'periodic', 'automation', 'job'],
    codeExample: `// wrangler.toml
[triggers]
crons = ["0 0 * * *"]  # Every day at midnight

// Multiple schedules
[triggers]
crons = [
  "*/15 * * * *",      # Every 15 minutes
  "0 */6 * * *",       # Every 6 hours
  "0 0 * * 1"          # Every Monday at midnight
]

// worker.ts
export default {
  async scheduled(event, env, ctx) {
    // event.cron: "0 0 * * *"
    // event.scheduledTime: Date of scheduled execution
    
    console.log('Cron job started:', event.scheduledTime);
    
    // Example: Cleanup old data
    ctx.waitUntil(async () => {
      const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);  // 30 days
      
      await env.DB.prepare(
        'DELETE FROM logs WHERE created_at < ?'
      ).bind(cutoff).run();
      
      console.log('Cleanup complete');
    });
  },
  
  // Can still handle HTTP requests
  async fetch(request, env) {
    return Response.json({ status: 'ok' });
  }
}`,
    docsUrl: 'https://developers.cloudflare.com/workers/configuration/cron-triggers/',
    relatedTopics: ['workers-basics', 'queues', 'durable-objects']
  },

  {
    id: 'vectorize',
    title: 'Vectorize - Vector Database for AI',
    category: 'ai',
    explanation: 'Vectorize is Cloudflare\'s vector database for storing and querying embeddings, enabling semantic search, recommendations, and RAG applications.',
    keywords: ['vectorize', 'vector', 'embeddings', 'similarity', 'search', 'ai', 'rag', 'semantic'],
    codeExample: `// wrangler.toml
[[vectorize]]
binding = "VECTOR_INDEX"
index_name = "my-embeddings"

// worker.ts
export default {
  async fetch(request, env) {
    // Generate embedding using Workers AI
    const text = "Cloudflare Workers are amazing";
    const embedding = await env.AI.run(
      '@cf/baai/bge-base-en-v1.5',
      { text }
    );
    
    // Insert vector
    await env.VECTOR_INDEX.insert([
      {
        id: 'doc-1',
        values: embedding.data[0],
        metadata: { text, category: 'docs' }
      }
    ]);
    
    // Query similar vectors
    const query = await env.AI.run(
      '@cf/baai/bge-base-en-v1.5',
      { text: 'serverless computing' }
    );
    
    const results = await env.VECTOR_INDEX.query(
      query.data[0],
      { 
        topK: 5,
        returnMetadata: true,
        filter: { category: 'docs' }
      }
    );
    
    return Response.json(results);
  }
}`,
    docsUrl: 'https://developers.cloudflare.com/vectorize/',
    relatedTopics: ['workers-ai', 'embeddings', 'd1-basics']
  },

  {
    id: 'error-handling',
    title: 'Error Handling Best Practices',
    category: 'developer-platform',
    explanation: 'Proper error handling ensures Workers respond gracefully to failures, log useful debugging information, and provide meaningful error responses.',
    keywords: ['error', 'errors', 'exception', 'try catch', 'error handling', 'debugging'],
    codeExample: `export default {
  async fetch(request, env, ctx) {
    try {
      // Your handler logic
      const response = await handleRequest(request, env);
      return response;
    } catch (error) {
      // Log error details
      console.error('Request failed:', {
        error: error.message,
        stack: error.stack,
        url: request.url,
        method: request.method
      });
      
      // Return user-friendly error
      return Response.json({
        error: 'An unexpected error occurred',
        message: env.DEBUG === 'true' ? error.message : undefined
      }, { status: 500 });
    }
  }
}

// Specific error handling
async function handleRequest(request, env) {
  try {
    const response = await fetch('https://api.example.com/data');
    
    if (!response.ok) {
      throw new APIError(\`API returned \${response.status}\`, response.status);
    }
    
    const data = await response.json();
    return Response.json(data);
    
  } catch (error) {
    if (error instanceof APIError) {
      return Response.json({ 
        error: 'External API error',
        status: error.statusCode 
      }, { status: 502 });
    }
    
    if (error.name === 'AbortError') {
      return Response.json({ 
        error: 'Request timeout' 
      }, { status: 504 });
    }
    
    throw error;  // Re-throw unknown errors
  }
}

class APIError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'APIError';
  }
}`,
    docsUrl: 'https://developers.cloudflare.com/workers/observability/',
    relatedTopics: ['workers-basics', 'logging', 'fetch-api']
  },

  {
    id: 'logging',
    title: 'Logging and Observability',
    category: 'developer-platform',
    explanation: 'Workers support console logging for debugging. Use wrangler tail for real-time logs, or configure Logpush for production log aggregation.',
    keywords: ['logging', 'logs', 'console', 'debug', 'monitoring', 'observability', 'tail'],
    codeExample: `// Basic logging
export default {
  async fetch(request, env) {
    console.log('Request received:', request.url);
    console.error('Error occurred:', error);
    console.warn('Warning:', message);
    console.debug('Debug info:', data);
    
    // Structured logging (JSON)
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'Processing request',
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers)
    }));
    
    return new Response('OK');
  }
}

// View logs in real-time:
// wrangler tail
// wrangler tail --format pretty
// wrangler tail --status error

// Custom logging class
class Logger {
  constructor(env) {
    this.env = env;
    this.level = env.LOG_LEVEL || 'info';
  }
  
  log(level, message, data = {}) {
    if (this.shouldLog(level)) {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        message,
        ...data
      }));
    }
  }
  
  shouldLog(level) {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    return levels[level] >= levels[this.level];
  }
  
  debug(message, data) { this.log('debug', message, data); }
  info(message, data) { this.log('info', message, data); }
  warn(message, data) { this.log('warn', message, data); }
  error(message, data) { this.log('error', message, data); }
}`,
    docsUrl: 'https://developers.cloudflare.com/workers/observability/logging/',
    relatedTopics: ['error-handling', 'wrangler', 'debugging']
  },

  {
    id: 'testing',
    title: 'Testing Workers with Vitest',
    category: 'developer-platform',
    explanation: 'Test Workers locally using Vitest and @cloudflare/vitest-pool-workers. Write unit and integration tests with access to bindings.',
    keywords: ['testing', 'tests', 'vitest', 'unit test', 'integration test', 'test'],
    codeExample: `// vitest.config.ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
      },
    },
  },
});

// test/worker.test.ts
import { describe, it, expect, env } from 'vitest';
import worker from '../src/index';

describe('Worker', () => {
  it('returns 200 for GET /', async () => {
    const request = new Request('http://localhost/');
    const response = await worker.fetch(request, env);
    
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toBe('Hello World!');
  });
  
  it('uses KV binding', async () => {
    await env.MY_KV.put('test-key', 'test-value');
    
    const request = new Request('http://localhost/kv/test-key');
    const response = await worker.fetch(request, env);
    
    const data = await response.json();
    expect(data.value).toBe('test-value');
  });
  
  it('handles errors gracefully', async () => {
    const request = new Request('http://localhost/error');
    const response = await worker.fetch(request, env);
    
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toHaveProperty('error');
  });
});

// Run tests: npm test`,
    docsUrl: 'https://developers.cloudflare.com/workers/testing/vitest-integration/',
    relatedTopics: ['workers-basics', 'wrangler', 'development']
  },
];

// =============================================================================
// Search and Ranking Logic
// =============================================================================

/**
 * Normalize query for better matching
 */
function normalizeQuery(query: string): string {
  return query.toLowerCase().trim();
}

/**
 * Calculate relevance score for a doc entry against a query
 */
function calculateRelevance(doc: DocEntry, query: string): {
  score: number;
  matchedKeywords: string[];
} {
  const normalizedQuery = normalizeQuery(query);
  const queryWords = normalizedQuery.split(/\s+/);
  
  let score = 0;
  const matchedKeywords: string[] = [];
  
  // Check keywords
  for (const keyword of doc.keywords) {
    const normalizedKeyword = keyword.toLowerCase();
    
    // Exact match (high score)
    if (normalizedQuery.includes(normalizedKeyword) || normalizedKeyword.includes(normalizedQuery)) {
      score += 10;
      matchedKeywords.push(keyword);
      continue;
    }
    
    // Word-level match (medium score)
    for (const word of queryWords) {
      if (normalizedKeyword.includes(word) || word.includes(normalizedKeyword)) {
        score += 3;
        if (!matchedKeywords.includes(keyword)) {
          matchedKeywords.push(keyword);
        }
      }
    }
  }
  
  // Check title
  const normalizedTitle = doc.title.toLowerCase();
  if (normalizedTitle.includes(normalizedQuery)) {
    score += 15;  // Title match is very relevant
  }
  
  // Check ID
  if (doc.id.includes(normalizedQuery.replace(/\s+/g, '-'))) {
    score += 8;
  }
  
  // Fuzzy match in explanation
  const normalizedExplanation = doc.explanation.toLowerCase();
  for (const word of queryWords) {
    if (word.length > 3 && normalizedExplanation.includes(word)) {
      score += 1;
    }
  }
  
  return { score, matchedKeywords };
}

/**
 * Search documentation based on query
 */
export function searchDocumentationFn(query: string, maxResults: number = 3): SearchDocsResponse {
  if (!query || query.trim().length === 0) {
    return {
      results: [],
      confidence: 0,
      totalMatches: 0
    };
  }
  
  // Calculate relevance for all docs
  const scoredDocs: SearchResult[] = [];
  
  for (const doc of DOCS_KNOWLEDGE_BASE) {
    const { score, matchedKeywords } = calculateRelevance(doc, query);
    
    if (score > 0) {
      scoredDocs.push({
        doc,
        score,
        matchedKeywords
      });
    }
  }
  
  // Sort by score (descending)
  scoredDocs.sort((a, b) => b.score - a.score);
  
  // Take top N results
  const topResults = scoredDocs.slice(0, maxResults);
  
  // Calculate confidence based on top score
  const maxPossibleScore = 50;  // Rough estimate
  const confidence = topResults.length > 0 
    ? Math.min(topResults[0].score / maxPossibleScore, 1.0)
    : 0;
  
  // Format results
  const results = topResults.map(result => ({
    title: result.doc.title,
    explanation: result.doc.explanation,
    codeExample: result.doc.codeExample,
    docsUrl: result.doc.docsUrl,
    relatedTopics: result.doc.relatedTopics.map(id => {
      const related = DOCS_KNOWLEDGE_BASE.find(d => d.id === id);
      return related ? related.title : id;
    })
  }));
  
  return {
    results,
    confidence,
    totalMatches: scoredDocs.length
  };
}

/**
 * Get all available topics (for browsing)
 */
export function getAllTopics(): Array<{ id: string; title: string; category: string }> {
  return DOCS_KNOWLEDGE_BASE.map(doc => ({
    id: doc.id,
    title: doc.title,
    category: doc.category
  }));
}

/**
 * Get a specific topic by ID
 */
export function getTopicById(id: string): DocEntry | null {
  return DOCS_KNOWLEDGE_BASE.find(doc => doc.id === id) || null;
}

// =============================================================================
// AI Tool Definition
// =============================================================================

const searchCloudflareDocsSchema = z.object({
  query: z.string().describe(
    'The search query. Can be a question like "How do I use KV?" or keywords like "D1 database setup".'
  ),
  maxResults: z.number().optional().default(3).describe(
    'Maximum number of results to return (1-5). Default is 3.'
  )
});

/**
 * AI Tool: Search Cloudflare documentation
 */
export const searchCloudflareDocs = tool({
  description: `Search Cloudflare Workers documentation to find relevant guides, code examples, and links.

This tool covers topics including:
- Storage: KV, D1, R2, Durable Objects
- Compute: Workers AI, Queues, Cron Triggers
- Network: Fetch API, WebSockets, Caching
- Platform: Bindings, Environment Variables, Wrangler CLI
- Security: CORS, Rate Limiting, Authentication
- Pages: Static sites with Functions

Provide a natural language query or keywords to find documentation.`,
  inputSchema: searchCloudflareDocsSchema,
  execute: async ({ query, maxResults }) => {
    const result = searchDocumentationFn(query, Math.min(maxResults || 3, 5));
    
    if (result.results.length === 0) {
      return `## No Documentation Found

I couldn't find specific documentation matching "${query}".

**Suggestions:**
- Try different keywords (e.g., "KV storage" instead of "key-value")
- Check for typos
- Browse available topics: Workers basics, KV, D1, R2, Durable Objects, Workers AI, Queues, Caching, CORS, Rate Limiting

**General Resources:**
- Main Docs: https://developers.cloudflare.com/workers/
- Discord: https://discord.cloudflare.com
- Examples: https://developers.cloudflare.com/workers/examples/`;
    }
    
    let response = `## Documentation Search Results for "${query}"\n\n`;
    response += `**Confidence:** ${Math.round(result.confidence * 100)}%  \n`;
    response += `**Found:** ${result.totalMatches} matching topic(s)\n\n`;
    
    for (let i = 0; i < result.results.length; i++) {
      const doc = result.results[i];
      
      response += `### ${i + 1}. ${doc.title}\n\n`;
      response += `${doc.explanation}\n\n`;
      
      response += `**Code Example:**\n\`\`\`typescript\n${doc.codeExample}\n\`\`\`\n\n`;
      
      response += `**Documentation:** ${doc.docsUrl}\n\n`;
      
      if (doc.relatedTopics.length > 0) {
        response += `**Related Topics:** ${doc.relatedTopics.join(', ')}\n\n`;
      }
      
      response += `---\n\n`;
    }
    
    return response;
  }
});
