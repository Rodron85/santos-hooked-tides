// Santos Hooked Tides: online copy of the catch log and ★ My spots, so they survive a new phone,
// a reinstall or the phone clearing the app's storage.
// Each phone has a backup code (SH-XXXX-XXXX-XXXX). The code is never stored: its SHA-256 names a
// Durable Object (SQLite storage) that keeps that code's catches, spots and deletions.
//   POST /api/sync  body {code, put:[{k:'c'|'p', item}], del:[id]}  → {ids, spotIds, deleted}
//   GET  /api/sync?code=…              → {ids, spotIds, deleted}
//   GET  /api/sync?code=…&ids=a,b,c    → {items:[{k, item}]}
import { DurableObject } from 'cloudflare:workers';

const CODE = /^SH-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
const ID = /^[A-Za-z0-9_-]{1,40}$/;
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS } });

export class LogVault extends DurableObject {
  async summary() {
    const out = { ids: [], spotIds: [], deleted: [] };
    for (const k of (await this.ctx.storage.list({ prefix: 'c:' })).keys()) out.ids.push(k.slice(2));
    for (const k of (await this.ctx.storage.list({ prefix: 'p:' })).keys()) out.spotIds.push(k.slice(2));
    for (const k of (await this.ctx.storage.list({ prefix: 'd:' })).keys()) out.deleted.push(k.slice(2));
    return out;
  }
  async apply(put, del) {
    const st = this.ctx.storage;
    for (const id of del) { await st.delete(['c:' + id, 'p:' + id]); await st.put('d:' + id, Date.now()); }
    for (const { k, item } of put) { if (await st.get('d:' + item.id)) continue; await st.put(k + ':' + item.id, item); }
    return this.summary();
  }
  async items(ids) {
    const out = [];
    for (let i = 0; i < ids.length; i += 100) {
      const keys = ids.slice(i, i + 100).flatMap(id => ['c:' + id, 'p:' + id]);
      for (const [k, v] of await this.ctx.storage.get(keys)) out.push({ k: k[0], item: v });
    }
    return out;
  }
}

async function vault(env, code) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('santos-hooked:' + code));
  const name = [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
  return env.VAULT.get(env.VAULT.idFromName(name));
}

export default async function sync(req, env) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (!env || !env.VAULT) return json({ error: 'online backup not set up on this server' }, 503);
  try {
    if (req.method === 'POST') {
      const text = await req.text();
      if (text.length > 4_000_000) return json({ error: 'too big, send fewer at a time' }, 413);
      const b = JSON.parse(text), code = String(b.code || '').toUpperCase();
      if (!CODE.test(code)) return json({ error: 'bad code' }, 400);
      const put = (Array.isArray(b.put) ? b.put : []).filter(x => x && (x.k === 'c' || x.k === 'p') && x.item && ID.test(String(x.item.id))).slice(0, 500);
      const del = (Array.isArray(b.del) ? b.del : []).map(String).filter(id => ID.test(id)).slice(0, 500);
      return json(await (await vault(env, code)).apply(put, del));
    }
    const sp = new URL(req.url).searchParams, code = String(sp.get('code') || '').toUpperCase();
    if (!CODE.test(code)) return json({ error: 'bad code' }, 400);
    const v = await vault(env, code);
    if (sp.get('ids')) return json({ items: await v.items(sp.get('ids').split(',').filter(id => ID.test(id)).slice(0, 300)) });
    return json(await v.summary());
  } catch (err) {
    return json({ error: String(err && err.message || err) }, 500);
  }
}
