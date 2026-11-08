// Santos Hooked Tides: Met Office weather warnings (public RSS), passed to the app as JSON.
// GET /.netlify/functions/warnings?region=se   (se = South East England, sw = South West England, UK = all)
const OK = new Set(['UK', 'se', 'sw', 'lse', 'ee', 'em', 'wm', 'nw', 'ne', 'yh', 'wl', 'ni', 'st', 'dg', 'ca', 'gr', 'hi', 'ta', 'ol', 'sl', 'nn', 'ss']);
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=900', 'netlify-cdn-cache-control': 'public, s-maxage=900' } });
const dec = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
const tag = (xml, t) => { const m = xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, 'i')); return m ? dec(m[1]) : ''; };

// IPMA (Portugal & Madeira): GET /.netlify/functions/warnings?src=ipma&area=LSB
const IPMA_AREAS = { AVR: 'Aveiro', BJA: 'Beja', BRG: 'Braga', BGC: 'Bragança', CBO: 'Castelo Branco', CBR: 'Coimbra', EVR: 'Évora', FAR: 'Faro', GDA: 'Guarda', LRA: 'Leiria', LSB: 'Lisboa', PTG: 'Portalegre', PTO: 'Porto', STM: 'Santarém', STB: 'Setúbal', VCT: 'Viana do Castelo', VRL: 'Vila Real', VIS: 'Viseu', MCN: 'Madeira north coast', MCS: 'Madeira south coast', MRM: 'Madeira mountains', MPS: 'Porto Santo' };
const IPMA_TYPES = { 'Agitação Marítima': 'sea swell', 'Vento': 'wind', 'Precipitação': 'rain', 'Nevoeiro': 'fog', 'Trovoada': 'thunderstorms', 'Tempo Frio': 'cold', 'Tempo Quente': 'heat', 'Neve': 'snow' };
const LEVEL = { yellow: 'Yellow', orange: 'Amber', red: 'Red' };
// IPMA times are Portuguese wall-clock time without a zone, so show them as written
const when = s => { const z = /Z|[+-]\d\d:?\d\d$/.test(String(s)), d = new Date(z ? s : String(s) + 'Z'); return isNaN(d) ? String(s) : d.toLocaleString('en-GB', { timeZone: z ? 'Europe/Lisbon' : 'UTC', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); };
async function ipma(area) {
  if (!IPMA_AREAS[area]) return json({ error: 'unknown area' }, 400);
  const r = await fetch('https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json', { headers: { 'user-agent': 'SantosHookedTides/1.0 (fishing app)' } });
  if (!r.ok) return json({ error: 'IPMA: HTTP ' + r.status, items: [] }, 502);
  const all = await r.json(), now = Date.now();
  const items = (Array.isArray(all) ? all : []).filter(w => w.idAreaAviso === area && LEVEL[w.awarenessLevelID] && new Date(w.endTime).getTime() > now)
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
    .map(w => ({ title: `${LEVEL[w.awarenessLevelID]} warning of ${IPMA_TYPES[w.awarenessTypeName] || String(w.awarenessTypeName || 'weather').toLowerCase()} affecting ${IPMA_AREAS[area]}`, desc: `Valid from ${when(w.startTime)} to ${when(w.endTime)}${w.text ? '. ' + String(w.text).slice(0, 240) : ''}`, link: 'https://www.ipma.pt/en/otempo/prev-sam/' }));
  return json({ region: 'ipma-' + area, items });
}

export default async (req) => {
  const sp = new URL(req.url).searchParams;
  if (sp.get('src') === 'ipma') { try { return await ipma(sp.get('area') || ''); } catch (err) { return json({ error: String(err && err.message || err), items: [] }, 502); } }
  const region = sp.get('region') || 'UK';
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
