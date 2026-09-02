import { registerWebMCPTools } from './webmcp.js';

const productTitle = document.querySelector('[data-product-title]');
const productId = document.querySelector('[data-product-id]');
const stage = document.querySelector('[data-stage]');
const proposalStatus = document.querySelector('[data-proposal-status]');
const createProposalButton = document.querySelector('[data-create-proposal]');
const webmcpStatus = document.querySelector('[data-webmcp-status]');
const backendStatus = document.querySelector('[data-backend-status]');
const sandboxNotice = document.querySelector('[data-sandbox-notice]');
const activityList = document.querySelector('[data-activity]');

async function request(path, options) {
  const response = await fetch(path, options);
  if (!response.ok) throw new Error('Request could not be completed');
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
    productTitle.textContent = 'Unable to load governed product';
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
    proposalStatus.textContent = 'Could not create the manual review proposal.';
  }
});

document.addEventListener('commercegov:webmcp-status', (event) => {
  webmcpStatus.textContent = event.detail.ready ? 'WebMCP READY' : 'WebMCP UNAVAILABLE';
});
document.addEventListener('commercegov:webmcp-activity', (event) => {
  const item = document.createElement('li');
  item.textContent = event.detail.name;
  if (activityList.firstElementChild?.textContent === 'Waiting for an agent tool call.') activityList.replaceChildren();
  activityList.append(item);
});

async function loadHealth() {
  try {
    const health = await request('/health');
    const sandbox = health.mode === 'judge_sandbox';
    backendStatus.textContent = sandbox ? 'JUDGE SANDBOX — READY' : health.mode === 'real' && health.backend !== 'ready' ? 'REAL INTEGRATION — DEGRADED' : `${String(health.mode).toUpperCase()} — READY`;
    sandboxNotice.hidden = !sandbox;
  } catch { backendStatus.textContent = 'BACKEND — DEGRADED'; }
}

load();
loadHealth();
registerWebMCPTools().then((ready) => { if (!ready) webmcpStatus.textContent = 'WebMCP UNAVAILABLE'; });
