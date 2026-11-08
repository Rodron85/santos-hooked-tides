// Santos Hooked Tides: Met Office weather warnings (public RSS), passed to the app as JSON.
// GET /.netlify/functions/warnings?region=se   (se = South East England, sw = South West England, UK = all)
const OK = new Set(['UK', 'se', 'sw', 'lse', 'ee', 'em', 'wm', 'nw', 'ne', 'yh', 'wl', 'ni', 'st', 'dg', 'ca', 'gr', 'hi', 'ta', 'ol', 'sl', 'nn', 'ss']);
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=900', 'netlify-cdn-cache-control': 'public, s-maxage=900' } });
const dec = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
const tag = (xml, t) => { const m = xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, 'i')); return m ? dec(m[1]) : ''; };

export default async (req) => {
  const region = new URL(req.url).searchParams.get('region') || 'UK';
  if (!OK.has(region)) return json({ error: 'unknown region' }, 400);
  try {
    const r = await fetch(`https://www.metoffice.gov.uk/public/data/PWSCache/WarningsRSS/Region/${region}`, { headers: { 'user-agent': 'SantosHookedTides/1.0 (fishing app)' } });
    if (!r.ok) return json({ error: 'Met Office: HTTP ' + r.status, items: [] }, 502);
    const xml = await r.text();
    const items = (xml.match(/<item[\s\S]*?<\/item>/gi) || []).map(it => ({ title: tag(it, 'title'), desc: tag(it, 'description').slice(0, 400), link: tag(it, 'link') })).filter(i => i.title);
    return json({ region, items });
  } catch (err) {
    return json({ error: String(err && err.message || err), items: [] }, 502);
  }
};
