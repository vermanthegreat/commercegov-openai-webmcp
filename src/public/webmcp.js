// This file contains the only WebMCP-specific assumption: document.modelContext.registerTool.
// Ordinary browsers safely skip registration. Adjust this boundary if the runtime contract evolves.
const tools = [
  {
    name: 'search_products',
    description: 'Find governed products available through CommerceGov.',
    execute: async ({ query = '', limit = 10 } = {}) => get(`/api/products?query=${encodeURIComponent(query)}&limit=${limit}`)
  },
  {
    name: 'get_governance_context',
    description: 'Read governed product context and its agent/human authority boundary.',
    execute: async ({ product_id }) => get(`/api/products/${encodeURIComponent(product_id)}/context`)
  },
  {
    name: 'propose_change',
    description: 'Create a CommerceGov Review proposal; this never directly mutates production.',
    execute: async ({ product_id, changes, idempotency_key }) => post(`/api/products/${encodeURIComponent(product_id)}/proposals`, { changes, idempotency_key })
  },
  {
    name: 'get_change_status',
    description: 'Read current governed proposal status.',
    execute: async ({ proposal_id }) => get(`/api/proposals/${encodeURIComponent(proposal_id)}`)
  },
  {
    name: 'get_audit_evidence',
    description: 'Read safe evidence about the governed proposal lifecycle.',
    execute: async ({ proposal_id }) => get(`/api/proposals/${encodeURIComponent(proposal_id)}/audit`)
  }
];

async function get(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

async function post(url, body) {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

export function registerWebMCPTools() {
  if (!document.modelContext || typeof document.modelContext.registerTool !== 'function') return false;
  for (const tool of tools) document.modelContext.registerTool(tool);
  return true;
}

export const intendedPublicTools = tools.map(({ name }) => name);
