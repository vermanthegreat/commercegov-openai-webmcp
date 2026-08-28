import { registerWebMCPTools } from './webmcp.js';

const productTitle = document.querySelector('[data-product-title]');
const productId = document.querySelector('[data-product-id]');
const stage = document.querySelector('[data-stage]');
const proposalStatus = document.querySelector('[data-proposal-status]');
const createProposalButton = document.querySelector('[data-create-proposal]');

async function request(path, options) {
  const response = await fetch(path, options);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

async function load() {
  try {
    const { products } = await request('/api/products');
    const product = products[0];
    productTitle.textContent = product.title;
    productId.textContent = product.product_id;
    stage.textContent = product.stage;
  } catch {
    productTitle.textContent = 'Unable to load mock product';
  }
}

createProposalButton.addEventListener('click', async () => {
  try {
    const proposal = await request('/api/products/7638071377991/proposals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ changes: { title: 'Improved Snowboard Title' }, idempotency_key: 'browser-demo-001' })
    });
    proposalStatus.textContent = `Proposal ${proposal.proposal_id}: ${proposal.stage} (${proposal.review_state}). Human approval and apply are still required.`;
  } catch {
    proposalStatus.textContent = 'Could not create proposal.';
  }
});

load();
registerWebMCPTools();
