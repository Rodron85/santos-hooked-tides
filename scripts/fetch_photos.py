# Downloads one real, licensed photo per species into public/fish/ (runs on GitHub Actions).
import json, os, re, sys, time, urllib.request, urllib.parse, io
from PIL import Image
UA = {'User-Agent': 'SantosHookedTides/1.0 (https://santos-hooked-tides.ronnieandrodrigues.workers.dev)'}
OUT = 'public/fish'; os.makedirs(OUT, exist_ok=True)
IDX = os.path.join(OUT, 'index.json')
idx = json.load(open(IDX)) if os.path.exists(IDX) else {}
PIN = json.load(open('scripts/pins.json')) if os.path.exists('scripts/pins.json') else {}
NOT_PHOTO = re.compile(r'map|range|distribution|verbreitung|logo|icon|drawing|illustration|plate|diagram|skeleton|\.svg$|\.gif$', re.I)

def get(url, tries=4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r: return r.read()
        except Exception as e:
            print('  retry', url[:90], e); time.sleep(5 * (i + 1))
    return None

def strip(h): return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', h or '')).strip()

def inat(name):
    time.sleep(1.2)
    b = get('https://api.inaturalist.org/v1/taxa?per_page=10&q=' + urllib.parse.quote(name))
    if not b: return None
    res = json.loads(b).get('results', [])
    t = next((x for x in res if (x.get('name') or '').lower() == name.lower()), None) or next((x for x in res if (x.get('matched_term') or '').lower() == name.lower()), None)
    ph = t and t.get('default_photo')
    if not ph or not ph.get('medium_url') or not ph.get('license_code'): return None
    return {'url': ph['medium_url'].replace('/medium.', '/large.'), 'url2': ph['medium_url'], 'credit': (ph.get('attribution') or '')[:90], 'lic': ph['license_code'].upper(), 'link': 'https://www.inaturalist.org/taxa/%s' % t['id'], 'via': 'iNaturalist'}

def commons(file):
    b = get('https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata|url&iiurlwidth=1000&titles=' + urllib.parse.quote('File:' + file))
    if not b: return None
    pg = list(json.loads(b)['query']['pages'].values())[0]; ii = (pg.get('imageinfo') or [None])[0]
    if not ii: return None
    md = ii.get('extmetadata', {}); lic = strip(md.get('LicenseShortName', {}).get('value'))
    if not re.search(r'CC|Public domain|PD|GFDL', lic): return None
    art = strip(md.get('Artist', {}).get('value'))[:48] or 'Unknown author'
    return {'url': ii.get('thumburl') or ii['url'], 'credit': art, 'lic': lic, 'link': 'https://commons.wikimedia.org/wiki/File:' + urllib.parse.quote(file), 'via': 'Wikimedia Commons'}

def wiki(key):
    b = get('https://en.wikipedia.org/api/rest_v1/page/summary/' + urllib.parse.quote(key) + '?redirect=true')
    if not b: return None
    s = json.loads(b); th = s.get('originalimage') or s.get('thumbnail') or {}
    m = re.search(r'/commons/(?:thumb/)?[0-9a-f]/[0-9a-f]{2}/([^/]+)', th.get('source', ''))
    if not m: return None
    f = urllib.parse.unquote(m.group(1))
    return commons(f) if re.search(r'\.(jpe?g|png)$', f, re.I) and not NOT_PHOTO.search(f) else None

keys = json.load(open('scripts/species.json')); force = os.environ.get('FORCE') == '1'
for k in keys:
    path = os.path.join(OUT, k + '.jpg')
    if not force and k in idx and os.path.exists(path) and k not in PIN: continue
    name = k.replace('_', ' '); print(k)
    info = commons(PIN[k]) if k in PIN else (inat(name) or wiki(k))
    if not info: print('  NO PHOTO'); continue
    data = get(info['url']) or (info.get('url2') and get(info['url2']))
    if not data: print('  download failed'); continue
    im = Image.open(io.BytesIO(data)).convert('RGB'); im.thumbnail((900, 900))
    im.save(path, 'JPEG', quality=80, optimize=True, progressive=True)
    idx[k] = {kk: info[kk] for kk in ('credit', 'lic', 'link', 'via')}
    json.dump(idx, open(IDX, 'w'), indent=0, sort_keys=True)
missing = [k for k in keys if k not in idx]
print('done:', len(idx), 'missing:', missing)
