# Testing Checklist for cf_ai_dev_copilot

This document provides a comprehensive testing checklist to verify that DevCopilot works correctly before submission.

---

## Pre-Deployment Verification

### Environment Setup

- [ ] Node.js version 22.12+ installed (`node --version`)
- [ ] Wrangler CLI installed and authenticated (`wrangler whoami`)
- [ ] Cloudflare account has Workers Paid plan (required for AI)
- [ ] KV namespace created and ID in wrangler.toml

### Configuration Check

Run the verification script:

```bash
npm run verify
```

Or manually check:

- [ ] `wrangler.toml` has correct AI binding (`binding = "AI"`)
- [ ] `wrangler.toml` has Durable Object configured (`class_name = "DevCopilotAgent"`)
- [ ] `wrangler.toml` has KV namespace with valid ID
- [ ] `.dev.vars` file exists (for local development)
- [ ] No TypeScript errors (`npm run check`)

---

## Manual Testing Scenarios

### Test 1: Error Log Analysis

**Purpose:** Verify the `analyzeCloudflareError` tool works correctly

**Steps:**

1. Open the chat interface at `http://localhost:5173`
2. Paste the following error log:
   ```
   Error: Worker exceeded CPU time limit
       at handleRequest (worker.js:42:15)
       at async Object.fetch (worker.js:12:3)
   ```
3. Send the message

**Expected Result:**

- Response identifies error as CPU_TIME_EXCEEDED
- Provides root cause explanation
- Suggests fixes (move computation to Queues, use streaming, cache operations)
- Includes code example

**Pass Criteria:** ✅ Response contains specific Cloudflare-related debugging advice

---

### Test 2: Code Review

**Purpose:** Verify the `reviewWorkerCode` tool works correctly

**Steps:**

1. Paste the following code:
   ```javascript
   export default {
     async fetch(request, env) {
       const data = await env.DB.prepare(
         "SELECT * FROM users WHERE id = " + request.url.split("/").pop()
       ).all();
       return new Response(JSON.stringify(data));
     }
   };
   ```
2. Ask: "Review this code for issues"

**Expected Result:**

- Identifies SQL injection vulnerability (critical)
- Notes missing error handling (warning)
- Suggests missing Content-Type header (suggestion)
- Provides fixed code example

**Pass Criteria:** ✅ At least 2 issues identified with severity ratings

---

### Test 3: Documentation Search

**Purpose:** Verify the `searchCloudflareDocs` tool works correctly

**Steps:**

1. Ask: "How do I use Durable Objects with WebSockets?"
2. Wait for response

**Expected Result:**

- Returns relevant documentation about Durable Objects
- Includes explanation of WebSocket hibernation
- Provides code example
- Links to official docs

**Pass Criteria:** ✅ Response includes accurate Cloudflare documentation references

---

### Test 4: Conversation Memory

**Purpose:** Verify Durable Object state persistence works

**Steps:**

1. Send message: "I'm building a rate limiter Worker"
2. Wait for response
3. Send follow-up: "What Cloudflare service should I use for this?"
4. Verify response references the rate limiter context

**Expected Result:**

- Second response acknowledges context from first message
- Suggests appropriate services (Durable Objects for rate limiting)
- Maintains conversation coherence

**Pass Criteria:** ✅ AI remembers context from previous messages

---

### Test 5: Project Context Persistence

**Purpose:** Verify project context is stored and retrieved

**Steps:**

1. Submit Worker code for review
2. Refresh the page
3. Check if sidebar shows the previously submitted code

**Expected Result:**

- Project context sidebar displays submitted code
- Resolved issues history is maintained
- Session info shows message count

**Pass Criteria:** ✅ Context persists across page refreshes (within session)

---

## Edge Case Testing

### Test 6: Empty Message

**Input:** Send empty message or whitespace only

**Expected:** Input validation prevents sending; no API call made

**Pass Criteria:** ✅ Empty messages are blocked at UI level

---

### Test 7: Very Long Code Block

**Input:** Paste code block with 500+ lines

**Expected:**

- Message is sent successfully
- Response may be truncated but includes key findings
- No timeout or crash

**Pass Criteria:** ✅ Handles large inputs gracefully

---

### Test 8: Invalid Error Log

**Input:** "This is not an error log, just random text"

**Expected:**

- AI acknowledges it cannot identify specific error patterns
- Provides general debugging guidance
- Does not crash or return error

**Pass Criteria:** ✅ Graceful handling of unrecognized input

---

### Test 9: Multiple Tool Calls

**Input:** "Review this code and also explain how KV works: [code]"

**Expected:**

- Both tools are invoked (code review + docs search)
- Response combines both outputs coherently
- No tool execution errors

**Pass Criteria:** ✅ Multiple tools can be called in sequence

---

### Test 10: Rapid Sequential Messages

**Steps:**

1. Send 5 messages in quick succession
2. Observe behavior

**Expected:**

- Messages are queued or processed in order
- No race conditions
- All responses eventually returned

**Pass Criteria:** ✅ System handles rapid input without errors

---

## Theme and UI Testing

### Test 11: Light/Dark Mode Toggle

**Steps:**

1. Click theme toggle button in header
2. Verify all components update correctly

**Expected:**

- Background colors change appropriately
- Text remains readable
- Code blocks have proper contrast
- No flash of incorrect theme

**Pass Criteria:** ✅ Complete theme switching works

---

### Test 12: Responsive Design

**Steps:**

1. Test on mobile viewport (375px width)
2. Test on tablet viewport (768px width)
3. Test on desktop viewport (1920px width)

**Expected:**

- Layout adapts to each screen size
- Sidebar collapses on mobile
- Input area remains accessible
- No horizontal scroll

**Pass Criteria:** ✅ Usable on all device sizes

---

## Performance Benchmarks

### Expected Response Times

| Metric                       | Target  | Acceptable |
| ---------------------------- | ------- | ---------- |
| Time to First Token          | < 500ms | < 1000ms   |
| Full Response (simple query) | < 2s    | < 4s       |
| Full Response (with tool)    | < 4s    | < 8s       |
| UI Interaction Latency       | < 100ms | < 200ms    |
| Theme Toggle                 | < 50ms  | < 100ms    |

### Memory Usage

| Metric            | Target |
| ----------------- | ------ |
| Initial Page Load | < 5MB  |
| After 10 Messages | < 15MB |
| After 50 Messages | < 30MB |

---

## Troubleshooting Guide

### Common Issues

#### Issue: "AI binding not found" error

**Cause:** Workers AI not properly configured

**Solution:**

1. Verify `wrangler.toml` has:
   ```toml
   [ai]
   binding = "AI"
   ```
2. Ensure you have Workers Paid plan
3. Redeploy: `npm run deploy`

---

#### Issue: "Durable Object not found" error

**Cause:** Durable Object migration not applied

**Solution:**

1. Check migration in `wrangler.toml`:
   ```toml
   [[migrations]]
   tag = "v1"
   new_sqlite_classes = ["DevCopilotAgent"]
   ```
2. Delete and recreate the Durable Object if needed
3. Redeploy: `npm run deploy`

---

#### Issue: KV namespace errors

**Cause:** KV namespace ID mismatch or not created

**Solution:**

1. Create new namespace: `wrangler kv namespace create "CACHE"`
2. Copy the ID to `wrangler.toml`
3. Redeploy

---

#### Issue: CORS errors in browser

**Cause:** Frontend-backend URL mismatch

**Solution:**

1. For local dev, ensure Vite proxy is configured
2. For production, verify Worker URL matches frontend expectations
3. Check `Access-Control-Allow-Origin` headers

---

#### Issue: Slow response times (>10s)

**Cause:** Workers AI cold start or model load

**Solution:**

1. First request may be slower; subsequent requests faster
2. Consider using the `fp8-fast` model variant (already configured)
3. Check Cloudflare status page for AI service issues

---

#### Issue: Theme not persisting

**Cause:** Theme state not saved to localStorage

**Solution:**

1. Check browser localStorage permissions
2. Verify no JavaScript errors in console
3. Theme is session-based by design (can be enhanced)

---

## Deployment Verification

After running `npm run deploy`, verify:

- [ ] Worker deployed successfully (check Cloudflare dashboard)
- [ ] Durable Object accessible
- [ ] KV namespace bound
- [ ] AI binding working
- [ ] Frontend accessible at deployed URL

### Quick Smoke Test

```bash
# Test Worker health endpoint
curl https://cf-ai-dev-copilot.<your-subdomain>.workers.dev/health

# Expected response:
# {"status":"ok","ai":true,"durableObject":true,"kv":true}
```

---

## Sign-Off Checklist

Before submission, confirm:

- [ ] All 12 test scenarios pass
- [ ] No console errors in browser
- [ ] No TypeScript errors (`npm run check`)
- [ ] Performance within acceptable range
- [ ] Dark/Light mode working
- [ ] Mobile responsive
- [ ] README.md complete
- [ ] PROMPTS.md complete
- [ ] Code is clean and commented
- [ ] Git history is clean

**Tester:** **\*\***\_\_\_**\*\***  
**Date:** **\*\***\_\_\_**\*\***  
**Version:** **\*\***\_\_\_**\*\***
