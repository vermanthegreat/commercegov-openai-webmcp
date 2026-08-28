# Public WebMCP tools

This is the complete intended public tool surface. It has no approval, apply, rollback, publishing, policy, RBAC, or Shopify-write tool.

| Tool | Purpose | Authority |
|---|---|---|
| `search_products` | Find governed products. Input: `{ "query": "string optional", "limit": 10 }`. | READ ONLY |
| `get_governance_context` | Return product state, effective policy, and the authority boundary. | READ ONLY |
| `propose_change` | Create a CommerceGov Review proposal. Input includes `product_id`, `changes`, and `idempotency_key`. | WRITE TO GOVERNANCE STATE ONLY |
| `get_change_status` | Read proposal/change lifecycle state (`review`, `approved`, `applied`, `failed`, or `rejected`). | READ ONLY |
| `get_audit_evidence` | Return safe lifecycle evidence. | READ ONLY |

`propose_change` creates a Review proposal only; it never implies direct production mutation.

## Authority invariants

```text
WEBMCP_MAY_SEARCH = true
WEBMCP_MAY_READ_CONTEXT = true
WEBMCP_MAY_PROPOSE = true
WEBMCP_MAY_READ_STATUS = true
WEBMCP_MAY_READ_AUDIT = true

WEBMCP_MAY_APPROVE = false
WEBMCP_MAY_APPLY = false
WEBMCP_MAY_ROLLBACK = false
WEBMCP_MAY_CHANGE_POLICY = false
WEBMCP_MAY_CHANGE_RBAC = false
WEBMCP_MAY_WRITE_SHOPIFY = false
```
