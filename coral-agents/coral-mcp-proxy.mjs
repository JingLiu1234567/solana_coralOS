#!/usr/bin/env node
// coral-mcp-proxy.mjs
// Bridges Claude Code (stdio) to coral-server (HTTP MCP).
// Patches tool schemas: removes int64 min/max that overflow Claude's API.

import { createInterface } from 'readline';

const CORAL_URL = process.env.CORAL_URL;
if (!CORAL_URL) {
  process.stderr.write('[coral-proxy] CORAL_URL env var is required\n');
  process.exit(1);
}
process.stderr.write(`[coral-proxy] connecting to ${CORAL_URL}\n`);

let coralSessionId = null;

function fixSchema(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(fixSchema);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if ((k === 'minimum' || k === 'maximum') && typeof v === 'number' && !Number.isSafeInteger(v)) {
      continue;
    }
    out[k] = fixSchema(v);
  }
  return out;
}

async function coralRequest(body) {
  const headers = { 'Content-Type': 'application/json' };
  if (coralSessionId) headers['mcp-session-id'] = coralSessionId;

  let resp;
  try {
    resp = await fetch(CORAL_URL, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch (e) {
    return { jsonrpc: '2.0', id: body.id, error: { code: -32000, message: String(e.message) } };
  }

  const newSid = resp.headers.get('mcp-session-id');
  if (newSid) coralSessionId = newSid;

  const ct = resp.headers.get('content-type') || '';

  if (ct.includes('text/event-stream')) {
    const text = await resp.text();
    for (const line of text.split('\n')) {
      if (line.startsWith('data: ')) {
        try { return JSON.parse(line.slice(6)); } catch {}
      }
    }
    return { jsonrpc: '2.0', id: body.id, error: { code: -32000, message: 'empty SSE stream' } };
  }

  if (!resp.ok) {
    const msg = await resp.text();
    return { jsonrpc: '2.0', id: body.id, error: { code: -32000, message: msg } };
  }

  return resp.json();
}

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on('line', async line => {
  line = line.trim();
  if (!line) return;

  let msg;
  try { msg = JSON.parse(line); } catch { return; }

  if (msg.id === undefined) {
    coralRequest(msg).catch(() => {});
    return;
  }

  try {
    let result = await coralRequest(msg);

    if (msg.method === 'tools/list' && result?.result?.tools) {
      result.result.tools = result.result.tools.map(t => ({
        ...t,
        inputSchema: fixSchema(t.inputSchema)
      }));
    }

    const out = { jsonrpc: '2.0', id: msg.id };
    if (result.error) out.error = result.error;
    else out.result = result.result ?? result;

    process.stdout.write(JSON.stringify(out) + '\n');
  } catch (e) {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0', id: msg.id,
      error: { code: -32000, message: String(e.message) }
    }) + '\n');
  }
});

rl.on('close', () => process.exit(0));
