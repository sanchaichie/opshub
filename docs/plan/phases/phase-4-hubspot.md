---
phase: 4
title: HubSpot CRM
status: done
started: 2026-11-10
completed: 2026-11-11
---

# Phase 4 — HubSpot CRM

## Goal
Every paid order upserts a HubSpot contact and deal, and the deal stage follows the order status.

## Scope
- OAuth with token refresh
- Contact upsert by email, deal create + association, stage mapping
- HubSpot rate-limit handling through `http.ts`

## Out of scope
- Two-way sync from HubSpot back to OpsHub

## Tasks
- [x] [P4-01 Expiring tokens: refresh in the shared plumbing](../tasks/phase-4/01-token-refresh.md)
- [x] [P4-02 HubSpot OAuth + CRM properties](../tasks/phase-4/02-hubspot-oauth.md)
- [x] [P4-03 Contact + deal sync](../tasks/phase-4/03-deal-sync.md)
- [x] [P4-04 HubSpot in the UI](../tasks/phase-4/04-hubspot-ui.md)

## Exit criteria
- Re-processing an order updates the existing contact/deal; no duplicates
- An expired access token is refreshed transparently

## Retrospective
**Done locally on 2026-11-11. The live HubSpot run is pending a test portal.**

**Changed versus the plan**
- **Deal stages describe the sale** (won/lost). Fulfilment goes in a custom `opshub_status` property instead of moving the deal through stages.
- **Duplicate prevention uses a unique `opshub_order_id` deal property**, created on connect, because HubSpot has no idempotency-key header.

**What the process caught**
- **security-reviewer:** a refresh racing a reconnect could have pointed an org's syncs at the wrong portal.
- **The render check:** the SSR timing bug from Phase 1, again.
- **A pgTAP test that only passed on a fresh database:** a Vault-cleanup assertion counted every secret in the DB, not just its own, so leftover e2e data made it fail. Claude scoped it rather than just resetting the database.

**Learned**
- **Retry safety can come from the data model** (a unique property plus upserts) when the API doesn't offer it.
- **Any "refresh then save" step needs a compare-and-set,** because humans reconnect while workers run.
