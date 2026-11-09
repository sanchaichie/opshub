---
id: P3-03
title: "Connect and disconnect in the UI"
phase: 3
status: done
started: 2026-11-10
completed: 2026-11-10
commits: []
---

# P3-03 — Connect and disconnect in the UI

## Goal
The Connections page lets owners and admins connect or disconnect Slack, shows which channel it posts to, and explains why the demo can't change connections.

## Acceptance criteria
- [x] Connect button → OAuth start; callback returns to `/connections` with a success or error toast
- [x] Connected card shows account/channel and when it was connected; Disconnect with confirmation
- [x] Members (non-admin) and demo visitors see the state but no buttons, with a short reason
- [x] SSR smoke test covers connected and not-connected states

## Files touched
- `app/pages/connections.vue`, `server/api/integrations.get.ts`

## How Claude was used
- **Connected cards** show account/channel and status, plus a *Needs reconnecting* state with the reason. Disconnect uses a click-again-to-confirm pattern. Members and demo visitors see the state with a short explanation instead of buttons.
- **Server-render checks** of the Connections page as owner (not connected, connected, broken), plain member and demo visitor.
- **A false alarm Claude checked rather than dismissed:** one assertion failed only because the page HTML-encodes the apostrophe in "can't" (`can&#39;t`).
- **security-reviewer finding, applied:** OAuth result toasts read `?connected=` from the URL, so a crafted link could display a fake "Your payroll account connected" message. Now only known providers and fixed error codes produce a toast.

## Outcome
Owners and admins can connect, reconnect and disconnect Slack from the Connections page. Everyone else, and the demo, can see the state but not change it.

## Follow-ups
- Visual check (phone width, dark mode) → P7
