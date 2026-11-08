---
phase: 4
title: HubSpot CRM
status: planned
started: 
completed:
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
_Created by the phase-start skill when this phase begins._

## Exit criteria
- Re-processing an order updates the existing contact/deal; no duplicates
- An expired access token is refreshed transparently

## Retrospective
_Written when the phase is done: what changed versus the plan, what was learned._
