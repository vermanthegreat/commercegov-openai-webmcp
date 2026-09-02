# CommerceGov WebMCP

## Problem

Most commerce agents expose actions. CommerceGov exposes bounded authority. An agent can help prepare a product-content change without gaining approval, application, or Shopify production authority.

## Why WebMCP

WebMCP makes the bounded workflow discoverable to a browser agent as five explicit capabilities, with strict input contracts and no hidden mutation route.

## Agent capabilities

- `search_products`
- `get_governance_context`
- `propose_change` (Review proposal only)
- `get_change_status`
- `get_audit_evidence`

## Capabilities deliberately absent

There is no approve, apply, rollback, policy/RBAC, publishing, or Shopify-write tool.

```text
Agent:
READ + ANALYZE + PROPOSE + OBSERVE

CommerceGov / Humans:
REVIEW + APPROVE + APPLY + VERIFY
```

## Hero journey

Run `search_products → get_governance_context → propose_change → get_change_status → get_audit_evidence`. The proposal always reports `production_changed: false` and the next required authority is human review.

## Architecture

Browser WebMCP handlers validate inputs before calling a small same-origin adapter. The adapter uses either a deterministic local sandbox or the CommerceGov Integration API. Browser code never receives integration credentials.

## Judge sandbox

Set `COMMERCEGOV_MODE=judge_sandbox` for deterministic, non-production data with no Render dependency. `GET /health` reports the explicit mode, five tools, and safe readiness. The UI labels it “Deterministic judge sandbox — not production.” The Node adapter retains sandbox state for its process lifetime; the Sites adapter retains it for the lifetime of the active worker isolate. It does not claim durable storage across isolate restarts.

Within that runtime lifetime, proposal replay is scoped by agency, shop, product, normalized controlled changes, and idempotency key. An identical request returns the existing proposal; reuse of the key for a different payload fails with `idempotency_conflict`.

## Real CommerceGov integration

Set `COMMERCEGOV_MODE=real` plus `COMMERCEGOV_API_URL`, `COMMERCEGOV_API_TOKEN`, `COMMERCEGOV_AGENCY_ID`, and `COMMERCEGOV_SHOP`. Real Integration API support exists; invalid configuration fails closed and never falls back to the sandbox. Upstream failures are reduced to fixed safe error categories before reaching browser or WebMCP clients; raw upstream messages and bodies are not surfaced.

## Safety boundary

Governance context projects the configured agency/shop scope and boolean agent authority. It intentionally does not fabricate user roles, risk scores, or approval authority. Real CommerceGov remains the final policy authority.

WebMCP registration is promise-aware and uses the standard registration `AbortSignal`. If an attempt fails partway through, that attempt is aborted so its earlier tools are unregistered before a retry. Execution cancellation reports `cancelled` and emits no success milestone, but does not claim that a server already processing a POST rolled it back.

## Challenge work versus pre-existing CommerceGov

CommerceGov predates this challenge. This repository contains the WebMCP challenge implementation; repository history shows WebMCP work beginning on 2026-08-28.

## Run / test / demo instructions

```sh
COMMERCEGOV_MODE=judge_sandbox npm start
npm test
npm run check
npm run build:site
```

Open `/health`, then the browser page. In a WebMCP-capable browser, run the hero journey and observe the activity trail. The same lifecycle is behaviorally tested through both the Node server and the Sites worker adapter. Manual browser proposal actions are explicitly labelled and are not presented as agent activity.
