// Netlify wrapper: the code lives in lib/warnings.js (shared with the Cloudflare Worker)
import warnings from '../../lib/warnings.js';
export default req => warnings(req);
