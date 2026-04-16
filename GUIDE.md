# State Architecture Guide (Zustand + TanStack Query)

This guide explains how state works in this codebase after the migration.

It is written for interns and new contributors.

---

## 1) Why We Use Two Libraries

We use **two different tools** because they solve different problems:

- **Zustand** = client/UI state (local app behavior)
- **TanStack Query** = server state (API-backed data, caching, invalidation)

Think of it like this:

- Zustand is your **whiteboard in the room** (temporary UI notes)
- TanStack Query is your **shared filing system** (server data + cache rules)

---

## 2) Quick Rule: Which One Do I Use?

Use this decision table:

- Use **Zustand** when state is:
  - purely UI interaction state
  - not authoritative on server
  - not shared with backend as source of truth

- Use **TanStack Query** when state is:
  - fetched from `/api/*` or server-backed source
  - should be cached/retried/invalidate-able
  - updated by mutations that should refresh related data

If unsure: default to **TanStack Query for server data**.

---

## 3) Current Project Architecture

### TanStack Query foundation

- Provider:
  - `src/components/providers/QueryProvider.tsx`
- Wired in:
  - `src/app/layout.tsx`
- Client defaults:
  - `src/lib/query/query-client.ts`
- Query key factory:
  - `src/lib/query/query-keys.ts`
- Policy:
  - `src/lib/query/POLICY.md`

### Zustand usage

- We keep Zustand only for UI-only needs.
- If a Zustand store becomes unused after migration, remove it.

---

## 4) Query Key Conventions (Very Important)

Always use centralized keys from:

- `src/lib/query/query-keys.ts`

Why:

- Prevents typo bugs
- Makes invalidation consistent
- Keeps cache structure predictable

Example keys:

- `queryKeys.coursesCatalog({ q, dept, page })`
- `queryKeys.assignmentSubmission({ assignmentId })`
- `queryKeys.moduleProgress({ moduleId })`
- `queryKeys.quizResult({ moduleId })`
- `queryKeys.feedbackStatus({ moduleId })`

---

## 5) Recommended Patterns

## A) Reading server data (`useQuery`)

1. Build params from URL/props (single source of truth)
2. Build query key using key factory
3. Fetch from API
4. Render loading/error/data states

## B) Writing server data (`useMutation`)

1. Call mutation endpoint
2. On success:
   - `setQueryData(...)` for immediate UI updates when useful
   - `invalidateQueries(...)` for affected related data
3. Avoid broad/global invalidations

---

## 6) Do and Don’t

Do:

- Keep URL as source of truth for filterable pages (like catalog)
- Keep query keys normalized (trim strings before key creation)
- Use targeted invalidation
- Keep server authorization checks on server routes/actions

Don’t:

- Don’t persist sensitive server/auth data to browser storage
- Don’t duplicate the same server-state in Zustand + Query simultaneously
- Don’t call `router.refresh()` if query cache update is enough
- Don’t create ad-hoc string keys inline

---

## 7) Security Guardrails

Never cache/persist as trusted client state:

- auth tokens/session artifacts
- role authorization truth
- secrets or privileged server-only data

Server remains authority for access checks.

Even if UI cache says something changed, server validation is final.

---

## 8) Intern Workflow Checklist

Before coding:

1. Is this UI state or server state?
2. If server state, which query key should represent it?
3. What data becomes stale after mutation?

While coding:

1. Add/update key in `query-keys.ts`
2. Use `useQuery`/`useMutation`
3. Add targeted invalidation logic

After coding:

1. Run lint
2. Run typecheck
3. Test back/forward behavior on URL-driven pages
4. Test mutation success + dependent UI updates

---

## 9) Example: Mutation With Immediate UI Update

```ts
const queryClient = useQueryClient()

const mutation = useMutation({
  mutationFn: submitSomething,
  onSuccess: async (result) => {
    // Immediate optimistic-like cache update for current screen
    queryClient.setQueryData(queryKeys.moduleProgress({ moduleId }), {
      completed: result.passed,
    })

    // Targeted revalidation for related data
    await queryClient.invalidateQueries({
      queryKey: queryKeys.quizResult({ moduleId }),
    })
  },
})
```

---

## 10) Architecture Summary

- **Zustand**: UI behavior state only
- **TanStack Query**: server state and cache lifecycle
- **URL**: canonical state for filter/search pages
- **Server**: canonical authority for security and permissions

If everyone follows these four lines, the codebase stays scalable, efficient, and secure.

