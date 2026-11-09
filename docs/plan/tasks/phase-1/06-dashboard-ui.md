---
id: P1-06
title: "Dashboard UI: live feed, orders, event inspector"
phase: 1
status: done
started: 2026-11-09
completed: 2026-11-09
commits: []
---

# P1-06 — Dashboard UI: live feed, orders, event inspector

## Goal
The screens a client will actually look at: a dashboard with a live event feed, the orders list and timeline, the webhook inspector with payloads and a Retry button, and the Connections page.

## Acceptance criteria
- [x] `/dashboard`: KPI tiles + live feed (Supabase Realtime, no refresh) + heartbeat footer
- [x] `/orders` and `/orders/:id` (status timeline, related events)
- [x] `/events` (filters: provider, direction, status) and `/events/:id` (request/response JSON, attempts, Retry)
- [x] `/connections` (Stripe as a platform integration; placeholders for later providers)
- [ ] Works in light and dark mode and at phone width (**not visually verified yet**: built with Nuxt UI tokens and responsive grids; screenshot check in P7 with Playwright)

## Files touched
- `app/pages/{dashboard,connections}.vue`, `app/pages/orders/*`, `app/pages/events/*`
- `app/components/{events,orders,connections}/*`, `app/composables/useRealtimeEvents.ts`

## How Claude was used
- **Built from Nuxt UI v4's dashboard components** (`UDashboardPanel`, `UTable`, `UTimeline`, `UPageCard`), plus a few small shared pieces: `StatusBadge`, `JsonView`, `EventFeed`, `useRealtime`, formatting helpers. Event-inspector filters live in the URL, so a filtered view can be shared.
- **A server-render smoke test caught two real bugs** that lint and typecheck couldn't. The test: a real user, real orders created through signed webhooks, then every page rendered with the session cookie, checking for expected content.
  1. `app.vue` never rendered `<NuxtLayout>`, so the sidebar shell wasn't showing at all (`NUXT_E4007` in the dev log).
  2. The orders and events lists rendered **empty on first load**. During server rendering the org id is still null when the list query runs, and after hydration the value doesn't change, so the watcher never re-fetches. The lists would have stayed empty until a Realtime event happened to arrive. Fix: `useOrg()` exposes `ready`, and pages `await ready` before querying.
  - After the fixes, all 7 pages render with their data and the dev log is clean.
- **Realtime + RLS verified in isolation.**
  - User A subscribed **without** the org filter, so only RLS separated the tenants. Webhooks for A's org and another org followed.
  - A received 3 event changes and 2 order changes; **0 leaked** from the other org.
  - One debugging detour: the first run received nothing at all. Claude used a service-role subscriber to check whether the app or the test was at fault. The cause was the test script (a no-argument `realtime.setAuth()` replaced the user's token), not the app.
- **Retry guard exercised.** This was left open in P1-05:
  - retrying a succeeded event returns 409 with a clear message
  - signed-out calls get 401 for both real and unknown ids, so there's no id probing
- **Honest gap:** the phone-width and dark-mode layout hasn't been checked visually yet.

## Outcome
The dashboard is usable end to end:
- **Dashboard:** KPI tiles, a live event feed with a "Live" indicator, and the keep-alive heartbeat line.
- **Orders:** a table with Simulate and a test Checkout, plus each order's detail page with items, status timeline and related events.
- **Event inspector:** filters, redacted payloads, attempt history and a working Retry button.
- **Connections:** which integrations exist and whether their keys are configured (booleans only).

## Follow-ups
- Visual check (light/dark, phone width) with Playwright screenshots → P7
