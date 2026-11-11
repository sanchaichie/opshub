---
id: P5-02
title: "Follow-up email on delivery"
phase: 5
status: done
started: 2026-11-11
completed: 2026-11-11
commits: []
---

# P5-02 — Follow-up email on delivery

## Goal
When an order is delivered, the customer gets one follow-up email from the org's connected Gmail account.

## Acceptance criteria
- [x] `send_follow_up` action: RFC 2822 message via the Gmail API, header-injection-safe, plain text + HTML
- [x] `order-flow` enqueues it on `delivered` (once per order) when Google is connected
- [x] Demo: recipient is always the allowlisted demo inbox (`NUXT_DEMO_EMAIL_ALLOWLIST`), never the order's customer
- [x] At-least-once trade-off documented (Gmail has no idempotency key)
- [x] Unit tests: MIME building, header injection, demo recipient rule

## Files touched
- `server/integrations/google/*`, `server/flows/order-flow.ts`

## How Claude was used
- **MIME builder:** sends multipart plain text + HTML. Header values are stripped of CR/LF, so customer data can't inject a `Bcc:`. Unit tests try exactly that, through both the subject and the recipient. HTML parts escape customer-controlled text.
- **The demo rule is enforced in one function (`recipientFor`):** in the demo, mail only ever goes to the owner's allowlisted inbox, whatever address an order carries. The security review confirmed it is the only source of the `To` header and of calendar attendees.
- **Once per order:** the follow-up's enqueue key is the order id. In the live check, a replayed "delivered" tracker update produced exactly one follow-up job.
- **An honest trade-off:** Gmail's send API has no idempotency key, so delivery is at-least-once. A crash in the instant after Gmail accepts a message could resend it. This is documented next to the code.
- **Demo abuse budget:** Claude added a shared hourly cap for demo Google actions (20/hour) while the security review ran. The review's two medium findings were about exactly that missing cap.

## Outcome
Delivered orders get one follow-up email from the org's Gmail. In the demo it goes to the owner's inbox.

**Pending keys:** a live send needs the Google OAuth client and a test user.

## Follow-ups
- Live Gmail send → P0-07
