# ADR 0008: AI assist: what goes to Anthropic, and how cost is bounded

- **Status:** Accepted
- **Date:** 2026-11-11

## Context
The AI assist feature (order summaries and draft replies) sends data to the Claude API and costs money per token, in an app with a public demo. Three questions needed explicit answers: what data leaves OpsHub, how the cost of a public demo is bounded, and how the calls fit OpsHub's reliability model.

## Decision
**Data sent to Anthropic (a subprocessor):**
- **Order details:** the store name, the customer's *first name only*, line items, totals, status history, the tracking code, and integration events (type, status, attempts, short error strings).
- **Never sent:** email or postal addresses.
- **The pasted customer message** is sent in full, because that's the feature. It is *not* stored in OpsHub; the event log records only its length.

**Prompt injection:**
- Order data and customer text go inside tags as data, and the static system prompts tell Claude to ignore any instructions inside them.
- Closing tags inside the data are neutralized.
- Output is only ever shown to a team member for review, rendered as plain text (no clickable links), with a "check links and claims" note. Nothing is sent automatically.
- In the shared demo, each visitor sees only their own outputs (RLS), so one visitor can't plant text for others.

**Cost:**
- **Requests:** per-IP limits in the demo, per-org limits elsewhere.
- **Tokens:** each org has a daily token budget, and the demo has its own. A budget is *reserved* before every call (input estimate + the 2,048-token output cap), so concurrent requests and failed or refused calls (still billed) count too.
- **Model:** `NUXT_ANTHROPIC_MODEL` defaults to `claude-opus-5-5`, following Anthropic's guidance. `claude-haiku-5-5` costs about 40× less per token and is the owner's call to switch to.

**Reliability:**
- **Official SDK:** calls use the official `@anthropic-ai/sdk` with its retries turned off, and its typed errors are mapped onto OpsHub's Retryable/Permanent classes.
- **Synchronous:** a person is waiting, so these calls run in the request rather than the queue. They are still logged as outbound events linked to the order.
- **Refusals:** server-side refusal fallbacks are enabled.

## Consequences
- The demo's worst-case daily AI spend is bounded by its token budget, plus nothing else.
- Real orgs pasting customer emails send them to Anthropic. That belongs in any privacy notice for a production deployment of OpsHub.
