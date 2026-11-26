// Santos Hooked Tides: known shipwrecks for the map, from EMODnet Human Activities
// ("Cultural Heritage, Ship wrecks": Historic England records for England, SHOM for France, etc.).
// GET /api/wrecks?bbox=minLon,minLat,maxLon,maxLat   → { items: [{ lat, lon, name, info: [[label, value], ...] }] }
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=86400', 'netlify-cdn-cache-control': 'public, s-maxage=86400' } });
const WFS = 'https://ows.emodnet-humanactivities.eu/wfs';
const LABELS = [ // which fields to show, matched loosely because the source mixes several databases
  [/^(sink_?year|year_?sunk|year)$/i, 'Sank'], [/dating|period/i, 'Period'], [/object_?type|^type$|vessel_?type|ship_?type/i, 'Type'],
  [/least_?depth|min_?depth/i, 'Least depth (m)'], [/max_?depth/i, 'Max depth (m)'], [/^depth$/i, 'Depth (m)'],
  [/protect/i, 'Protection'], [/sink_?context|circumstance|cause/i, 'How it sank'], [/location_?precision|precision/i, 'Position accuracy'],
];
const NAME = /^(name|ship_?name|vessel_?name|object_?name|wreck_?name|title)$/i;
const clean = v => v == null ? '' : String(v).replace(/\s+/g, ' ').trim();
function centre(g) {
  if (!g) return null;
  if (g.type === 'Point') return g.coordinates;
  const pts = []; const walk = a => Array.isArray(a[0]) ? a.forEach(walk) : pts.push(a); walk(g.coordinates || []);
  if (!pts.length) return null;
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}
export default async function wrecks(req) {
  const b = (new URL(req.url).searchParams.get('bbox') || '').split(',').map(Number);
  if (b.length !== 4 || b.some(n => !isFinite(n)) || b[2] <= b[0] || b[3] <= b[1]) return json({ error: 'bbox=minLon,minLat,maxLon,maxLat', items: [] }, 400);
  if ((b[2] - b[0]) * (b[3] - b[1]) > 4) return json({ error: 'area too big, zoom in', items: [] }, 400);
  const q = new URLSearchParams({ service: 'WFS', version: '1.0.0', request: 'GetFeature', typeName: 'emodnet:heritageshipwrecks', outputFormat: 'application/json', srsName: 'EPSG:4326', maxFeatures: '600', bbox: b.join(',') });
  try {
    const r = await fetch(`${WFS}?${q}`, { headers: { 'user-agent': 'SantosHookedTides/1.0 (fishing app)' }, cf: { cacheTtl: 86400, cacheEverything: true } });
    if (!r.ok) return json({ error: 'EMODnet: HTTP ' + r.status, items: [] }, 502);
    const fc = await r.json();
    const items = (fc.features || []).map(f => {
      const c = centre(f.geometry); if (!c) return null;
      const p = f.properties || {}, keys = Object.keys(p);
      const nk = keys.find(k => NAME.test(k) && clean(p[k]));
      const info = [];
      LABELS.forEach(([re, label]) => { const k = keys.find(k => re.test(k) && clean(p[k]) && !/^(0|null|unknown)$/i.test(clean(p[k]))); if (k && !info.some(x => x[0] === label)) info.push([label, clean(p[k]).slice(0, 120)]); });
      return { lon: +c[0].toFixed(5), lat: +c[1].toFixed(5), name: nk ? clean(p[nk]).slice(0, 80) : 'Unnamed wreck', info };
    }).filter(Boolean);
    return json({ items, more: items.length >= 600 });
  } catch (err) {
    return json({ error: String(err && err.message || err), items: [] }, 502);
  }
}
