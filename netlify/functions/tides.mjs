// Santos Hooked Tides: proxy to the ADMIRALTY UK Tidal API (Discovery).
// The browser can't call the Admiralty API directly (CORS), and this keeps the key private.
// GET /.netlify/functions/tides?lat=50.90&lon=-1.40  ->  nearest station + next 7 days of high/low waters (UTC).
const BASE = 'https://admiraltyapi.azure-api.net/uktidalapi/api/V1';
let stationsCache = null, stationsAt = 0;

const km = (a, b, c, d) => {
  const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};
const json = (body, status = 200, maxAge = 0) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'cache-control': maxAge ? `public, max-age=${maxAge}` : 'no-store',
    ...(maxAge ? { 'netlify-cdn-cache-control': `public, s-maxage=${maxAge}` } : {})
  }
});

export default async (req) => {
  const key = process.env.ADMIRALTY_KEY;
  if (!key) return json({ error: 'ADMIRALTY_KEY is not set in Netlify environment variables' }, 500);
  const u = new URL(req.url), lat = parseFloat(u.searchParams.get('lat')), lon = parseFloat(u.searchParams.get('lon'));
  if (!isFinite(lat) || !isFinite(lon)) return json({ error: 'lat and lon are required' }, 400);
  const H = { 'Ocp-Apim-Subscription-Key': key };
  try {
    if (!stationsCache || Date.now() - stationsAt > 7 * 864e5) {
      const r = await fetch(`${BASE}/Stations`, { headers: H });
      if (!r.ok) return json({ error: 'Admiralty stations: HTTP ' + r.status }, 502);
      const g = await r.json();
      stationsCache = (g.features || []).map(f => ({ id: f.properties.Id, name: f.properties.Name, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
      stationsAt = Date.now();
    }
    const near = stationsCache.map(s => ({ ...s, d: km(lat, lon, s.lat, s.lon) })).sort((a, b) => a.d - b.d)[0];
    if (!near || near.d > 40) return json({ error: 'No Admiralty station within 40 km', nearest: near ? { name: near.name, km: Math.round(near.d) } : null }, 404, 3600);
    const r = await fetch(`${BASE}/Stations/${encodeURIComponent(near.id)}/TidalEvents?duration=7`, { headers: H });
    if (!r.ok) return json({ error: 'Admiralty events: HTTP ' + r.status }, 502);
    const ev = await r.json();
    const events = ev.map(e => ({ type: e.EventType === 'HighWater' ? 'HW' : 'LW', t: Date.parse(/Z$|[+-]\d\d:\d\d$/.test(e.DateTime) ? e.DateTime : e.DateTime + 'Z'), h: typeof e.Height === 'number' ? Math.round(e.Height * 100) / 100 : null }))
      .filter(e => isFinite(e.t)).sort((a, b) => a.t - b.t);
    return json({ station: { id: near.id, name: near.name, km: Math.round(near.d * 10) / 10, lat: near.lat, lon: near.lon }, events, attribution: 'Contains ADMIRALTY® tidal data: © Crown Copyright and database right.' }, 200, 3600);
  } catch (err) {
    return json({ error: String(err && err.message || err) }, 502);
  }
};
