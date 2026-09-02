import test from 'node:test';
import assert from 'node:assert/strict';
import { toolDescriptors, intendedPublicTools, registerWebMCPTools } from '../src/public/webmcp.js';
import { createSiteWorker } from '../src/site-worker.js';
import { createMockCommerceGov } from '../src/commercegov/mock.js';

test('actual descriptors expose exactly five strict bounded tools', () => {
  assert.deepEqual(intendedPublicTools, ['search_products', 'get_governance_context', 'propose_change', 'get_change_status', 'get_audit_evidence']);
  assert.equal(intendedPublicTools.some((name) => /approve|apply|shopify/i.test(name)), false);
  for (const tool of toolDescriptors) {
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(typeof tool.title, 'string');
    assert.equal(typeof tool.annotations.readOnlyHint, 'boolean');
    assert.equal(typeof tool.annotations.untrustedContentHint, 'boolean');
  }
});

test('handlers reject malformed, additional, and privileged data before transport', async () => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response('{}'); };
  try {
    await assert.rejects(toolDescriptors[1].execute({}), (e) => e.code === 'invalid_input');
    await assert.rejects(toolDescriptors[0].execute({ extra: true }), (e) => e.code === 'invalid_input');
    await assert.rejects(toolDescriptors[2].execute({ product_id: '1', changes: { apply: 'yes' }, idempotency_key: 'safe-key-1' }), (e) => e.code === 'forbidden_action');
    await assert.rejects(toolDescriptors[2].execute({ product_id: '1', changes: { title: 'x' }, idempotency_key: 'safe-key-1', action: 'apply' }), (e) => e.code === 'forbidden_action');
    assert.equal(calls, 0);
  } finally { globalThis.fetch = previousFetch; }
});

test('execution forwards cancellation and does not complete activity', async () => {
  const previousFetch = globalThis.fetch;
  const controller = new AbortController(); controller.abort();
  globalThis.fetch = async (_url, options) => { assert.equal(options.signal, controller.signal); throw new DOMException('aborted', 'AbortError'); };
  try { await assert.rejects(toolDescriptors[0].execute({}, { signal: controller.signal }), (e) => e.code === 'cancelled'); }
  finally { globalThis.fetch = previousFetch; }
});

test('Sites worker preserves judge sandbox lifecycle and payload-aware replay', async () => {
  const worker = createSiteWorker({});
  const env = { COMMERCEGOV_MODE: 'judge_sandbox', COMMERCEGOV_AGENCY_ID: 'demo-agency', COMMERCEGOV_SHOP: 'demo.myshopify.com' };
  const health = await worker.fetch(new Request('https://example.test/health'), env);
  assert.deepEqual(await health.json(), { status: 'ok', mode: 'judge_sandbox', webmcp_tools: 5, backend: 'ready' });
  const search = await worker.fetch(new Request('https://example.test/api/products'), env);
  assert.equal((await search.json()).products[0].product_id, '7638071377991');

  const proposalRequest = (title) => new Request('https://example.test/api/products/7638071377991/proposals', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ changes: { title }, idempotency_key: 'sites-replay-001' })
  });
  const createdResponse = await worker.fetch(proposalRequest('Improved Snowboard'), env);
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  const status = await worker.fetch(new Request(`https://example.test/api/proposals/${created.proposal_id}`), env);
  assert.equal(status.status, 200);
  assert.equal((await status.json()).state, 'review');
  const audit = await worker.fetch(new Request(`https://example.test/api/proposals/${created.proposal_id}/audit`), env);
  assert.equal(audit.status, 200);
  assert.equal((await audit.json()).events[0].event, 'proposal_created');
  const replay = await (await worker.fetch(proposalRequest('Improved Snowboard'), env)).json();
  assert.equal(replay.proposal_id, created.proposal_id);
  assert.equal(replay.idempotent_replay, true);
  const conflictResponse = await worker.fetch(proposalRequest('Different Snowboard'), env);
  assert.equal(conflictResponse.status, 409);
  assert.deepEqual(await conflictResponse.json(), {
    code: 'idempotency_conflict',
    message: 'The idempotency key was already used for a different proposal request.'
  });
});

test('idempotency is scoped to binding, product, and normalized changes', async () => {
  const mock = createMockCommerceGov({ agency: 'agency-a', shop: 'a.myshopify.com' });
  const first = await mock.proposeChange('7638071377991', {
    changes: { title: 'A', description: 'B' }, idempotency_key: 'scoped-key-001'
  });
  const reorderedReplay = await mock.proposeChange('7638071377991', {
    changes: { description: 'B', title: 'A' }, idempotency_key: 'scoped-key-001'
  });
  assert.equal(reorderedReplay.proposal_id, first.proposal_id);
  assert.equal(reorderedReplay.idempotent_replay, true);
  await assert.rejects(
    mock.proposeChange('7638071377991', { changes: { title: 'Different' }, idempotency_key: 'scoped-key-001' }),
    (error) => error.code === 'idempotency_conflict' && error.status === 409
  );
  const otherScope = createMockCommerceGov({ agency: 'agency-b', shop: 'b.myshopify.com' });
  const independent = await otherScope.proposeChange('7638071377991', {
    changes: { title: 'Different' }, idempotency_key: 'scoped-key-001'
  });
  assert.equal(independent.idempotent_replay, false);
});

test('partial WebMCP registration is cleaned up and retry succeeds', async () => {
  const prior = globalThis.document;
  const installed = new Map();
  const statuses = [];
  let rejectThird = true;
  globalThis.document = {
    modelContext: {
      registerTool: async (tool, { signal }) => {
        if (installed.has(tool.name)) throw new DOMException('duplicate', 'InvalidStateError');
        if (rejectThird && tool.name === 'propose_change') throw new Error('injected registration failure');
        installed.set(tool.name, tool);
        signal.addEventListener('abort', () => installed.delete(tool.name), { once: true });
      }
    },
    dispatchEvent: (event) => { if (event.type === 'commercegov:webmcp-status') statuses.push(event.detail.ready); }
  };
  try {
    assert.equal(await registerWebMCPTools(), false);
    assert.equal(installed.size, 0);
    rejectThird = false;
    assert.equal(await registerWebMCPTools(), true);
    assert.equal(installed.size, 5);
    assert.deepEqual([...installed.keys()], intendedPublicTools);
    assert.equal(await registerWebMCPTools(), true);
    assert.equal(installed.size, 5);
    assert.deepEqual(statuses, [false, true]);
  } finally { globalThis.document = prior; }
});

test('real upstream secrets are normalized across JSON, text, and thrown errors', async () => {
  const marker = 'CG_SHOULD_NEVER_LEAK_9f3a';
  const priorFetch = globalThis.fetch;
  const env = {
    COMMERCEGOV_MODE: 'real', COMMERCEGOV_API_URL: 'https://commercegov.test',
    COMMERCEGOV_API_TOKEN: 'fake-token', COMMERCEGOV_AGENCY_ID: 'agency-a', COMMERCEGOV_SHOP: 'demo.myshopify.com'
  };
  const cases = [
    async () => new Response(JSON.stringify({ error: { code: 'upstream_failure', message: marker } }), { status: 500 }),
    async () => new Response(marker, { status: 500 }),
    async () => { throw new Error(marker); }
  ];
  try {
    for (const fetchImpl of cases) {
      globalThis.fetch = fetchImpl;
      const response = await createSiteWorker({}).fetch(new Request('https://example.test/api/products'), env);
      const surfaced = JSON.stringify(await response.json());
      assert.doesNotMatch(surfaced, new RegExp(marker));
      assert.match(surfaced, /backend_unavailable|invalid_backend_response/);
    }
    globalThis.fetch = async () => new Response(JSON.stringify({ code: 'backend_unavailable', message: marker, error: marker }), { status: 503 });
    await assert.rejects(toolDescriptors[0].execute({}), (error) => {
      assert.equal(error.code, 'backend_unavailable');
      assert.doesNotMatch(error.message, new RegExp(marker));
      return true;
    });
  } finally { globalThis.fetch = priorFetch; }
});

test('successful WebMCP hero emits exact terminal activity order', async () => {
  const priorDocument = globalThis.document;
  const priorFetch = globalThis.fetch;
  const observed = [];
  globalThis.document = { dispatchEvent: (event) => { if (event.type === 'commercegov:webmcp-activity') observed.push(event.detail.name); } };
  globalThis.fetch = async (url) => {
    if (url.startsWith('/api/products?')) return new Response(JSON.stringify({ products: [{ product_id: '42' }] }));
    if (url.endsWith('/context')) return new Response(JSON.stringify({ product_id: '42' }));
    if (url.endsWith('/proposals')) return new Response(JSON.stringify({ proposal_id: '7' }), { status: 201 });
    if (url.endsWith('/audit')) return new Response(JSON.stringify({ proposal_id: '7', events: [] }));
    return new Response(JSON.stringify({ proposal_id: '7', state: 'review' }));
  };
  try {
    await toolDescriptors[0].execute({});
    await toolDescriptors[1].execute({ product_id: '42' });
    await toolDescriptors[2].execute({ product_id: '42', changes: { title: 'Safe' }, idempotency_key: 'activity-key-001' });
    await toolDescriptors[3].execute({ proposal_id: '7' });
    await toolDescriptors[4].execute({ proposal_id: '7' });
    assert.deepEqual(observed, [
      'Product discovered', 'Governance inspected', 'Change proposed',
      'Status checked', 'Audit evidence read', 'Waiting for human review'
    ]);
  } finally {
    globalThis.document = priorDocument;
    globalThis.fetch = priorFetch;
  }
});
