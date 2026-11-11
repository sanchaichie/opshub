---
id: P4-02
title: "HubSpot OAuth + CRM properties"
phase: 4
status: done
started: 2026-11-10
completed: 2026-11-11
commits: []
---

# P4-02 — HubSpot OAuth + CRM properties

## Goal
Orgs connect their HubSpot portal with OAuth, and OpsHub prepares the two deal properties it needs on first connect.

## Acceptance criteria
- [x] `server/integrations/hubspot/oauth.ts`: authorize, code exchange, refresh, portal lookup for the account label
- [x] On connect: create deal properties `opshub_order_id` (unique) and `opshub_status` (already-exists is fine)
- [x] Unit tests with a stubbed HubSpot API

## Files touched
- `server/integrations/hubspot/*`

## How Claude was used
- **OAuth through the generic flow from Phase 3:** HubSpot only supplies its `OAuthConfig`.
- **Property bootstrap on connect:** OpsHub creates two deal properties. `opshub_order_id` is **unique**, which is what makes every later sync safe to retry. An "already exists" reply is fine.
- **Unit tests** against a stubbed HubSpot API cover the exchange, the property creation (one already existing), and a rejected refresh being treated as permanent.
- **security-reviewer nit, applied:** HubSpot's account-lookup endpoint puts the token in the URL path. Claude checked that http.ts logs host-only and that this call isn't event-logged, and documented the constraint next to the call.

## Outcome
Orgs can connect a HubSpot portal. The account label shows the portal domain, and the deal properties OpsHub needs are created automatically.

## Follow-ups
-
