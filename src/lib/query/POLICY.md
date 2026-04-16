# TanStack Query Cache Policy

## Purpose
Use TanStack Query for server-state caching and mutation invalidation while keeping security-sensitive authorization on the server.

## Query Key Conventions
- Use `queryKeys` from `src/lib/query/query-keys.ts`.
- Keep keys domain-first with a parameter object for filters/ids.
- Do not create inline ad-hoc key strings in components.

## Security Rules
- Do not use query persistence plugins for this project right now.
- Never persist or trust client cache for auth tokens, role checks, secrets, or service-role data.
- Keep access control in server routes/actions/middleware.

## Invalidation Rules
- Assignment mutations invalidate `assignmentSubmission` and impacted module progress keys.
- Quiz/feedback submissions invalidate module progress and feature-specific keys.
- Module completion updates set module progress cache and invalidate module progress key.

## Runtime Defaults
- Use shared `QueryClient` defaults from `src/lib/query/query-client.ts`.
- Favor targeted invalidation over broad/global invalidation.
