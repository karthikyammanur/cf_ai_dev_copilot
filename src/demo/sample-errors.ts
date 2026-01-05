/**
 * Sample Error Logs for DevCopilot Demo
 *
 * These are realistic Cloudflare Worker error logs that demonstrate
 * DevCopilot's error analysis capabilities. Each error includes:
 * - Realistic stack traces
 * - Actual error messages from Workers runtime
 * - Context that would appear in production logs
 *
 * @module demo/sample-errors
 */

export interface SampleError {
  /** Unique identifier for the error */
  id: string;
  /** Display name for the UI */
  name: string;
  /** Brief description of what this error demonstrates */
  description: string;
  /** The actual error log content */
  log: string;
  /** Category for grouping in UI */
  category: "runtime" | "binding" | "network" | "security";
  /** Difficulty level for learning purposes */
  difficulty: "beginner" | "intermediate" | "advanced";
}

/**
 * Collection of sample error logs for demonstration
 */
export const SAMPLE_ERRORS: SampleError[] = [
  // =========================================================================
  // 1. CPU Time Exceeded Error
  // =========================================================================
  {
    id: "cpu-time-exceeded",
    name: "CPU Time Exceeded",
    description:
      "Worker exceeded the 50ms CPU time limit due to inefficient processing",
    category: "runtime",
    difficulty: "intermediate",
    log: `Error: Worker exceeded CPU time limit
Timestamp: 2025-01-04T14:32:18.847Z
Worker: api-worker
Ray ID: 8a1b2c3d4e5f6g7h

Stack Trace:
  at processLargeDataset (worker.js:145:12)
  at handleRequest (worker.js:89:5)
  at async Object.fetch (worker.js:23:10)

Execution Context:
  CPU Time Used: 52.3ms (limit: 50ms)
  Wall Time: 1,247ms
  Subrequests: 3/50
  Memory: 45.2MB

Request Details:
  Method: POST
  URL: https://api.example.com/process
  CF-Ray: 8a1b2c3d4e5f6g7h-SJC
  
Console Output:
  [log] Processing 50,000 items...
  [log] Item 12,000 processed
  [log] Item 24,000 processed
  [warn] Approaching CPU limit at item 36,000
  [error] CPU time exceeded at item 42,156

Hint: This Worker is performing synchronous operations on a large dataset.
Consider using streaming, pagination, or moving heavy computation to a
Durable Object with longer execution limits.`
  },

  // =========================================================================
  // 2. KV Binding Error
  // =========================================================================
  {
    id: "kv-binding-error",
    name: "KV Namespace Not Bound",
    description:
      "Attempting to use a KV namespace that isn't configured in wrangler.toml",
    category: "binding",
    difficulty: "beginner",
    log: `TypeError: Cannot read properties of undefined (reading 'get')
Timestamp: 2025-01-04T09:15:42.123Z
Worker: session-manager
Ray ID: 7b2c3d4e5f6g7h8i

Stack Trace:
  at getSession (worker.js:67:28)
  at handleAuth (worker.js:34:15)
  at async Object.fetch (worker.js:12:8)

Error Details:
  Binding Name: SESSION_STORE
  Expected Type: KVNamespace
  Actual Value: undefined

Request Context:
  Method: GET
  URL: https://app.example.com/api/user/profile
  Headers:
    Authorization: Bearer eyJhbGc...
    Cookie: session_id=abc123xyz

wrangler.toml configuration (current):
  name = "session-manager"
  main = "src/index.ts"
  compatibility_date = "2024-01-01"
  
  # Note: KV namespace binding is missing!
  # Add the following:
  # [[kv_namespaces]]
  # binding = "SESSION_STORE"
  # id = "your-kv-namespace-id"

Suggestion: Add the KV namespace binding to your wrangler.toml file,
then run \`wrangler deploy\` to update the Worker configuration.`
  },

  // =========================================================================
  // 3. CORS Error
  // =========================================================================
  {
    id: "cors-error",
    name: "CORS Preflight Failure",
    description:
      "API Worker rejecting cross-origin requests due to missing CORS headers",
    category: "network",
    difficulty: "beginner",
    log: `Access to fetch at 'https://api.example.com/data' from origin 
'https://app.example.com' has been blocked by CORS policy: Response to 
preflight request doesn't pass access control check: No 
'Access-Control-Allow-Origin' header is present on the requested resource.

Browser Console Error:
  Fetch API cannot load https://api.example.com/data
  Cross-Origin Request Blocked: The Same Origin Policy disallows reading
  the remote resource. (Reason: CORS header missing)

Worker Logs (api.example.com):
  Timestamp: 2025-01-04T16:45:33.891Z
  Ray ID: 9c3d4e5f6g7h8i9j
  
  [log] Incoming request: OPTIONS /data
  [log] Method: OPTIONS (preflight)
  [log] Origin: https://app.example.com
  [error] No CORS handler for OPTIONS request
  
  Response sent:
    Status: 405 Method Not Allowed
    Headers: (none related to CORS)

Request Headers from Browser:
  Origin: https://app.example.com
  Access-Control-Request-Method: POST
  Access-Control-Request-Headers: content-type, authorization

Expected Response Headers:
  Access-Control-Allow-Origin: https://app.example.com
  Access-Control-Allow-Methods: GET, POST, OPTIONS
  Access-Control-Allow-Headers: Content-Type, Authorization
  Access-Control-Max-Age: 86400

The Worker needs to handle OPTIONS preflight requests and return
appropriate CORS headers for the frontend to make cross-origin requests.`
  },

  // =========================================================================
  // 4. Subrequest Limit Error
  // =========================================================================
  {
    id: "subrequest-limit",
    name: "Subrequest Limit Exceeded",
    description:
      "Worker making too many fetch() calls, hitting the 50 subrequest limit",
    category: "runtime",
    difficulty: "advanced",
    log: `Error: Too many subrequests
Timestamp: 2025-01-04T11:28:55.432Z
Worker: aggregator-worker
Ray ID: 6e7f8g9h0i1j2k3l

Error Message:
  Exceeded subrequest limit. Workers can make at most 50 subrequests per
  invocation. This Worker attempted to make 51 subrequests.

Execution Trace:
  Subrequest #1:  GET https://api1.example.com/users     [200] 45ms
  Subrequest #2:  GET https://api2.example.com/orders    [200] 67ms
  Subrequest #3:  GET https://api3.example.com/products  [200] 34ms
  ... (47 more subrequests)
  Subrequest #50: GET https://api1.example.com/user/50   [200] 23ms
  Subrequest #51: GET https://api1.example.com/user/51   [BLOCKED]

Stack Trace:
  at fetchUserDetails (worker.js:234:18)
  at Promise.all (native)
  at aggregateData (worker.js:178:12)
  at handleRequest (worker.js:45:8)

Code Pattern Detected:
  // Problematic code making parallel requests for each user
  const userDetails = await Promise.all(
    userIds.map(id => fetch(\`https://api1.example.com/user/\${id}\`))
  );

Recommendation:
  1. Batch requests: Modify API to accept multiple IDs in one request
  2. Use Durable Objects: Store/cache data to reduce external calls
  3. Implement pagination: Process users in smaller batches
  4. Use Service Bindings: For internal Workers, avoid HTTP overhead`
  },

  // =========================================================================
  // 5. Durable Object Alarm Error
  // =========================================================================
  {
    id: "durable-object-alarm",
    name: "Durable Object Storage Error",
    description:
      "Durable Object hitting storage limits or transaction conflicts",
    category: "binding",
    difficulty: "advanced",
    log: `Error: Durable Object transaction conflict
Timestamp: 2025-01-04T20:12:08.654Z
Worker: realtime-counter
Durable Object: CounterDO
Object ID: 0x8a9b0c1d2e3f4g5h

Error Details:
  Type: TransactionConflict
  Message: Transaction failed due to concurrent modification.
           Another transaction modified the same keys.

Storage Operation:
  Operation: put
  Keys affected: ["counter:pageviews", "counter:last_updated"]
  Transaction ID: txn_1704398528654

Conflicting Transactions:
  Transaction A (this request):
    Started: 2025-01-04T20:12:08.650Z
    Keys: ["counter:pageviews"]
    Operation: increment by 1
    
  Transaction B (concurrent):
    Started: 2025-01-04T20:12:08.648Z
    Keys: ["counter:pageviews"]
    Operation: increment by 1
    Status: Committed first

Stack Trace:
  at CounterDO.incrementCounter (counter.js:45:18)
  at CounterDO.fetch (counter.js:23:12)

Console Output:
  [log] Incrementing pageview counter
  [log] Current value: 1,234,567
  [error] Transaction conflict detected
  [log] Retrying with exponential backoff...
  [log] Retry 1 of 3...

Resolution Applied:
  Automatic retry succeeded after 15ms delay.
  New counter value: 1,234,569

Note: High-contention scenarios require careful transaction design.
Consider using atomic operations (this.storage.transaction) or
implementing client-side retry logic with jitter.`
  }
];

/**
 * Get a sample error by ID
 */
export function getSampleError(id: string): SampleError | undefined {
  return SAMPLE_ERRORS.find((error) => error.id === id);
}

/**
 * Get all sample errors for a category
 */
export function getSampleErrorsByCategory(
  category: SampleError["category"]
): SampleError[] {
  return SAMPLE_ERRORS.filter((error) => error.category === category);
}

/**
 * Get sample errors formatted for the UI dropdown
 */
export function getSampleErrorOptions(): Array<{
  value: string;
  label: string;
  description: string;
}> {
  return SAMPLE_ERRORS.map((error) => ({
    value: error.id,
    label: error.name,
    description: error.description
  }));
}
