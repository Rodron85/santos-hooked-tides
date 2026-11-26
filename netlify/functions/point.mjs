// Netlify wrapper: the code lives in lib/point.js (shared with the Cloudflare Worker)
import point from '../../lib/point.js';
export default req => point(req);
