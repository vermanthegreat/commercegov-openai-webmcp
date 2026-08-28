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

This initial milestone uses deterministic mock CommerceGov data. Wiring the real CommerceGov Integration API is a later milestone.

## Commands

```sh
npm install
npm start
npm test
npm run check
```

## Public WebMCP tools

- `search_products`
- `get_governance_context`
- `propose_change`
- `get_change_status`
- `get_audit_evidence`

## Explicit non-goals

This WebMCP app does not directly approve, apply, or rollback changes; alter policy or RBAC; or mutate Shopify. Its only write is creating a governed Review proposal.
