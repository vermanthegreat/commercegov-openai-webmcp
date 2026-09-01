# CommerceGov WebMCP

CommerceGov WebMCP lets browser agents inspect commerce state and create governed proposals while production authority remains inside CommerceGov.

> Most commerce agents expose actions. CommerceGov exposes bounded authority.

## Boundary

```text
Agent:
READ + ANALYZE + PROPOSE + OBSERVE

CommerceGov:
REVIEW + APPROVE + APPLY + VERIFY
```

The server adapter supports an explicit deterministic mock mode and a real
CommerceGov Integration API mode. Browser code and the five WebMCP tools use the
same normalized local boundary in either mode.

## Commands

```sh
npm install
npm start
npm test
npm run check
```

Copy `.env.example` into your local environment and set `COMMERCEGOV_MODE` to
`mock` for deterministic development or `real` for the Integration API. Real
mode requires the API URL, OAuth access token, expected agency id, and canonical
shop domain. Invalid real configuration fails closed and never falls back to the
mock.

## Public WebMCP tools

- `search_products`
- `get_governance_context`
- `propose_change`
- `get_change_status`
- `get_audit_evidence`

## Explicit non-goals

This WebMCP app does not directly approve, apply, or rollback changes; alter policy or RBAC; or mutate Shopify. Its only write is creating a governed Review proposal.
