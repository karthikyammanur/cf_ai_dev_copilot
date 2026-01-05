/**
 * Sample Worker Code for DevCopilot Demo
 *
 * These examples demonstrate code review capabilities with:
 * - Performance issues
 * - Security vulnerabilities
 * - Well-written code (for comparison)
 *
 * @module demo/sample-code
 */

export interface SampleCode {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** What this example demonstrates */
  description: string;
  /** The actual code */
  code: string;
  /** Quality rating */
  quality: "poor" | "needs-improvement" | "good" | "excellent";
  /** Issues present (for poor/needs-improvement) */
  issues?: string[];
  /** Language for syntax highlighting */
  language: string;
}

/**
 * Collection of sample Worker code for demonstration
 */
export const SAMPLE_CODE: SampleCode[] = [
  // =========================================================================
  // 1. Worker with Performance Issues
  // =========================================================================
  {
    id: "performance-issues",
    name: "Worker with Performance Issues",
    description: "Common performance anti-patterns in a Cloudflare Worker",
    quality: "poor",
    language: "typescript",
    issues: [
      "Blocking I/O in a loop",
      "No caching strategy",
      "Synchronous JSON parsing of large payloads",
      "Inefficient string concatenation",
      "Missing request coalescing"
    ],
    code: `// ❌ Worker with Performance Issues
// This Worker has several performance anti-patterns

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === "/api/users") {
      // ❌ Issue 1: Fetching all users one-by-one (N+1 problem)
      const userIds = await env.DB.prepare("SELECT id FROM users").all();
      const users = [];
      
      for (const row of userIds.results) {
        // ❌ Issue 2: Sequential fetch in loop - very slow!
        const userData = await fetch(
          \`https://external-api.com/user/\${row.id}\`
        );
        const user = await userData.json();
        users.push(user);
      }
      
      // ❌ Issue 3: No caching - hits DB and API on every request
      return new Response(JSON.stringify(users), {
        headers: { "Content-Type": "application/json" }
      });
    }
    
    if (url.pathname === "/api/report") {
      // ❌ Issue 4: Loading entire dataset into memory
      const allData = await env.KV.get("massive-dataset", "json");
      
      // ❌ Issue 5: Inefficient string building
      let html = "<html><body><table>";
      for (const item of allData.items) {
        html = html + "<tr><td>" + item.name + "</td></tr>";
      }
      html = html + "</table></body></html>";
      
      return new Response(html, {
        headers: { "Content-Type": "text/html" }
      });
    }
    
    // ❌ Issue 6: No error handling
    const data = await request.json();
    
    // ❌ Issue 7: Blocking regex on user input (ReDoS vulnerability)
    const emailRegex = /^([a-zA-Z0-9_\\-\\.]+)@([a-zA-Z0-9_\\-\\.]+)\\.([a-zA-Z]{2,5})$/;
    if (!emailRegex.test(data.email)) {
      return new Response("Invalid email", { status: 400 });
    }
    
    return new Response("OK");
  }
};`
  },

  // =========================================================================
  // 2. Worker with Security Issues
  // =========================================================================
  {
    id: "security-issues",
    name: "Worker with Security Vulnerabilities",
    description: "Common security mistakes in Cloudflare Workers",
    quality: "poor",
    language: "typescript",
    issues: [
      "Hardcoded API keys",
      "No input validation",
      "SQL injection vulnerability",
      "Missing authentication",
      "Overly permissive CORS",
      "Sensitive data in logs"
    ],
    code: `// ❌ Worker with Security Vulnerabilities
// DO NOT use this code in production!

// ❌ Issue 1: Hardcoded secrets (should use env.SECRET)
const API_KEY = "sk-1234567890abcdef";
const DB_PASSWORD = "admin123";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // ❌ Issue 2: Overly permissive CORS
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "*",
      "Access-Control-Allow-Headers": "*"
    };
    
    const url = new URL(request.url);
    
    // ❌ Issue 3: No authentication check
    if (url.pathname === "/api/admin/users") {
      // ❌ Issue 4: SQL Injection vulnerability
      const userId = url.searchParams.get("id");
      const query = \`SELECT * FROM users WHERE id = \${userId}\`;
      const result = await env.DB.prepare(query).all();
      
      // ❌ Issue 5: Leaking sensitive data in logs
      console.log("User data retrieved:", JSON.stringify(result));
      
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    
    if (url.pathname === "/api/webhook") {
      const body = await request.text();
      
      // ❌ Issue 6: No webhook signature verification
      // Anyone can send fake webhook events!
      const event = JSON.parse(body);
      await processWebhook(event);
      
      return new Response("OK", { headers: corsHeaders });
    }
    
    if (url.pathname === "/api/upload") {
      const formData = await request.formData();
      const file = formData.get("file") as File;
      
      // ❌ Issue 7: No file type validation
      // Could allow malicious file uploads
      const key = \`uploads/\${file.name}\`;
      await env.R2.put(key, file.stream());
      
      // ❌ Issue 8: Exposing internal paths
      return new Response(JSON.stringify({
        path: \`/var/storage/\${key}\`,
        internalId: env.WORKER_ID
      }), { headers: corsHeaders });
    }
    
    // ❌ Issue 9: Eval on user input (code injection)
    const code = url.searchParams.get("calc");
    if (code) {
      const result = eval(code);
      return new Response(String(result));
    }
    
    return new Response("Not Found", { status: 404 });
  }
};

async function processWebhook(event: any) {
  // Process without validation
  console.log("Processing:", event);
}`
  },

  // =========================================================================
  // 3. Well-Written Worker (Best Practices)
  // =========================================================================
  {
    id: "best-practices",
    name: "Well-Written Worker",
    description: "Demonstrates Cloudflare Worker best practices",
    quality: "excellent",
    language: "typescript",
    issues: [],
    code: `// ✅ Well-Written Cloudflare Worker
// Demonstrates security, performance, and reliability best practices

import { z } from "zod";

// Type-safe environment bindings
interface Env {
  USERS_KV: KVNamespace;
  API_SECRET: string;
  ALLOWED_ORIGINS: string;
  DB: D1Database;
}

// Input validation schemas
const UserSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(100).trim()
});

// CORS configuration - specific origins only
function getCorsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get("Origin") || "";
  const allowedOrigins = env.ALLOWED_ORIGINS.split(",");
  
  if (allowedOrigins.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400"
    };
  }
  return {};
}

// Authentication middleware
async function authenticate(request: Request, env: Env): Promise<boolean> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  
  const token = authHeader.slice(7);
  // ✅ Use constant-time comparison for tokens
  const encoder = new TextEncoder();
  const a = encoder.encode(token);
  const b = encoder.encode(env.API_SECRET);
  
  if (a.length !== b.length) return false;
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = getCorsHeaders(request, env);
    
    // ✅ Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    
    try {
      const url = new URL(request.url);
      
      // ✅ Rate limiting with KV
      const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
      const rateKey = \`rate:\${clientIP}\`;
      const requests = parseInt(await env.USERS_KV.get(rateKey) || "0");
      
      if (requests > 100) {
        return new Response("Rate limit exceeded", {
          status: 429,
          headers: { ...corsHeaders, "Retry-After": "60" }
        });
      }
      
      await env.USERS_KV.put(rateKey, String(requests + 1), {
        expirationTtl: 60
      });
      
      // ✅ Protected routes with authentication
      if (url.pathname.startsWith("/api/")) {
        if (!await authenticate(request, env)) {
          return new Response("Unauthorized", {
            status: 401,
            headers: corsHeaders
          });
        }
      }
      
      // ✅ Parameterized queries (prevents SQL injection)
      if (url.pathname === "/api/users") {
        const id = url.searchParams.get("id");
        
        if (id) {
          const stmt = env.DB.prepare(
            "SELECT id, name, email FROM users WHERE id = ?"
          );
          const result = await stmt.bind(id).first();
          
          if (!result) {
            return new Response("Not found", {
              status: 404,
              headers: corsHeaders
            });
          }
          
          return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      }
      
      // ✅ Input validation with Zod
      if (url.pathname === "/api/users" && request.method === "POST") {
        const body = await request.json();
        const parsed = UserSchema.safeParse(body);
        
        if (!parsed.success) {
          return new Response(JSON.stringify({
            error: "Validation failed",
            details: parsed.error.flatten()
          }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        
        // ✅ Use parameterized insert
        await env.DB.prepare(
          "INSERT INTO users (email, name) VALUES (?, ?)"
        ).bind(parsed.data.email, parsed.data.name).run();
        
        return new Response(JSON.stringify({ success: true }), {
          status: 201,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      
      return new Response("Not Found", {
        status: 404,
        headers: corsHeaders
      });
      
    } catch (error) {
      // ✅ Error handling without leaking internals
      console.error("Worker error:", error);
      
      return new Response(JSON.stringify({
        error: "Internal server error"
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};`
  }
];

/**
 * Get sample code by ID
 */
export function getSampleCode(id: string): SampleCode | undefined {
  return SAMPLE_CODE.find((code) => code.id === id);
}

/**
 * Get all sample code formatted for UI selection
 */
export function getSampleCodeOptions(): Array<{
  value: string;
  label: string;
  description: string;
  quality: string;
}> {
  return SAMPLE_CODE.map((code) => ({
    value: code.id,
    label: code.name,
    description: code.description,
    quality: code.quality
  }));
}
