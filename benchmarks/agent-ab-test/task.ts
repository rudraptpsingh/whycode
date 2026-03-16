/**
 * Task definition for the Auth + Rate-Limit API benchmark.
 */

export const TASK_PROMPT = `Build a minimal Express API with:

1. **JWT auth middleware** — validates Bearer tokens and attaches user to request
2. **Redis-based rate limiter middleware** — limits requests per IP
3. **Endpoints**:
   - GET /api/me — protected by auth, returns current user
   - GET /api/health — public, rate-limited

Requirements:
- Use TypeScript
- Use Express
- Include a runnable server (e.g. server.ts or index.ts)
- JWT: use jsonwebtoken, tokens from Authorization header
- Rate limit: use Redis (or ioredis) for counters
- Include package.json with dependencies

Create the project from scratch in the workspace directory.`

export const EXPECTED_FILES = [
  "package.json",
  "auth.ts",
  "rate-limiter.ts",
  "server.ts",
]
