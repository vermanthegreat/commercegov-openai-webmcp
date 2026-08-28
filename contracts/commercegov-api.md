# CommerceGov client boundary

The browser calls local skeleton/BFF endpoints only. They are not canonical CommerceGov production API routes.

The `src/commercegov/client.js` interface currently delegates to deterministic in-memory mock data. A later milestone may replace it with the real CommerceGov Integration API without rewriting WebMCP browser registration.

The boundary preserves this rule: WebMCP writes create governed Review proposals; they do not write to Shopify.
