# CommerceGov Integration API mapping

This adapter targets the existing CommerceGov public Integration API mounted at
`/api/integration/v1`. The mapping below is based on the route implementations,
Pydantic schemas, services, and `tests/integration/*` in the CommerceGov source
repository at commit `1595b87dd83e30bb4117057760b31ff1ffad7b74`.

The browser calls only this project's local BFF routes. OAuth access tokens and
CommerceGov binding configuration remain server-side.

| WebMCP tool | CommerceGov route/service | Method | Request | Response | Auth and binding | Authority implications |
|---|---|---|---|---|---|---|
| `search_products` | `/api/integration/v1/shops/{shop_id}/products` → `integration_read_service.list_products` | GET | Path: canonical `*.myshopify.com`; query: `stage?`, `limit` 1–100, `offset` ≥0. The API has no text-query parameter, so the adapter performs case-insensitive title/product-id filtering over at most 10 pages of 100 results. | `{shop_id, products:[{product_id,title,stage,updated_at}], limit, offset, has_more, stage?}`; normalized to `{products}`. | OAuth bearer token; `products:read`; token resolves `subject_id`, `agency_id`, and client; subject membership and agency/shop membership are both checked before the service call. | Read-only projection. No Shopify credential or write path. The 1,000-product search window is an adapter limitation, not a fabricated CommerceGov route. |
| `get_governance_context` | Composite of `/api/integration/v1/shops/{shop_id}/products/{product_id}/content` → `integration_read_service.get_product_content` and `/api/integration/v1/shops/{shop_id}/policy` → `integration_read_service.get_effective_shop_policy` | GET + GET | Canonical shop path and strict decimal product id. | Content: `{shop_id,product_id,field_registry,stage,content:{title,description,meta_title,meta_description},audit_id?,updated_at}`. Policy: `{shop_id,schema_version,effective_policy_hash,controlled_fields,rules:{brand_tone,forbidden_terms,max_length,seo_constraints,proposal_instructions}}`. Adapter returns one normalized context plus the fixed propose-only authority statement. | OAuth bearer token; `products:read` and `policy:read`; the same subject/agency/shop checks guard both reads. Adapter additionally verifies both responses echo the configured shop and the content echoes the requested product. | Read-only. Policy is observed, never changed. No new CommerceGov capability is introduced by composing existing reads. |
| `propose_change` | `/api/integration/v1/shops/{shop_id}/products/{product_id}/proposals` → `integration_proposal_service.create_integration_proposal` | POST | `{changes:{title?,description?,meta_title?,meta_description?},idempotency_key}`. Extra fields and explicit null controlled fields are forbidden; at least one controlled field is required; key length is 8–128. | `{shop_id,product_id,proposal_id,review_state:"Review/pending",stage:"review",policy_result,effective_policy_hash,changed_fields,content,idempotent_replay,summary}` with 201 on create or 200 on idempotent replay. Adapter also exposes normalized target, mutation class, proposed value, agency/shop, and next required authority. | OAuth bearer token; `proposals:write`; subject/agency/shop binding is enforced before strict product validation and persistence. | Creates only a persisted Review proposal/audit record. It does not approve, apply, roll back, enqueue writeback, or call Shopify. Adapter rejects generic/forbidden action fields before transport. |
| `get_change_status` | `/api/integration/v1/proposals/{proposal_id}` → `integration_proposal_read_service.get_proposal_status` | GET | Strict positive decimal proposal/audit id. | `{proposal_id,review_state,state}` where states are `review`, `review_pending`, `reviewed`, `approved`, `applied`, `rejected`, or `failed`; normalized to `{proposal_id,state}`. | OAuth bearer token; `proposals:read`; proposal lookup is restricted to the token subject's authorized shops intersected with its agency's shops. Cross-tenant records are returned as not found. | Read-only lifecycle observation. |
| `get_audit_evidence` | `/api/integration/v1/proposals/{proposal_id}/trace` → `integration_proposal_read_service.build_audit_trace` | GET | Strict positive decimal proposal/audit id. | `{proposal_id,events:[{event,state,at}],truncated,complete,returned_count}`. Public events are bounded to proposal/policy/generation/edit/approved/applied evidence. | OAuth bearer token; `proposals:read`; the same subject + agency authorized-shop intersection protects lookup. Cross-tenant records are returned as not found. | Read-only, bounded public evidence. No raw audit metadata or credentials are returned. |

## Authentication and configuration

CommerceGov uses an OAuth access token in `Authorization: Bearer <token>`. The
token resolves an active integration client, subject, agency, scopes, and token
identifier. Required combined scopes are `products:read policy:read
proposals:write proposals:read`; `shops:read` is useful for provisioning/smoke
validation but is not required by every mapped route. Agency identity is derived
from the OAuth subject rather than accepted from a caller-controlled header.

The WebMCP real client is bound server-side to one expected agency identifier and
one canonical shop. Caller-supplied binding assertions, when present, must match
that configuration. CommerceGov remains the final authority and independently
checks subject assignment, agency tenancy, shop installation state, and scopes.

## Failure semantics

The Integration API returns a normalized `{error:{code,message,retryable,
request_id,retry_after_seconds}}` envelope and `Cache-Control: no-store`.
Relevant statuses include 401 for missing/invalid/expired tokens, 403 for missing
scope or subject authorization, 404 for hidden/cross-tenant shop or proposal
records, 409 for idempotency/concurrency conflicts, 422 for invalid identifiers,
stage, controlled fields, or governability, 429 with `Retry-After`, and 5xx/503
for unavailable content/policy or invalid persisted state. The adapter preserves
the safe code/status/retry metadata without returning raw credentials or response
bodies.

## Production backing and gaps

All five mappings are mounted public Integration API routes backed by CommerceGov
database/read-model and governed proposal services, with dedicated integration
tests. There is no route gap for the requested tool set.

`search_products` has one capability limitation: CommerceGov exposes paginated
product listing, not server-side free-text search. The adapter therefore applies
a bounded local filter. This is not an authority gap and does not require a
CommerceGov change.
