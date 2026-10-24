/**
 * Host → /t/{slug}/ rewrite for Cloudflare Pages.
 * Also keeps brand chrome on /account/* when brand context is known
 * (host brand, vt_brand cookie, or safe next=/t/{slug}/…).
 *
 * Production: bind wildcard DNS `*.yourapex.com` → this Pages project,
 * set env PUBLIC_SITE_APEX=yourapex.com (no protocol).
 *
 * P0 path fallback (no DNS): https://viral-templates.pages.dev/t/bby-wow/
 */

const KNOWN_SLUGS = new Set([
  'bby-wow',
  'kiss-cam',
  'ceiling-fan',
  'bulin-47',
  'zombie-love',
  'smalltown-boy-cats',
  'clapping-cat',
  'knight-cat',
  'car-jump',
]);

const BRAND_COOKIE = 'vt_brand';

function apexFromEnv(env) {
  const raw = (env && env.PUBLIC_SITE_APEX) || 'viral-templates.pages.dev';
  return String(raw)
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

function parseCookies(request) {
  const raw = request.headers.get('cookie') || '';
  const out = {};
  raw.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx < 0) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) return;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  });
  return out;
}

function brandFromPath(pathname) {
  const m = String(pathname || '').match(/^\/(?:zh\/)?t\/([a-z0-9-]+)(?:\/|$)/);
  if (!m) return null;
  return KNOWN_SLUGS.has(m[1]) ? m[1] : null;
}

function brandFromNext(raw) {
  if (typeof raw !== 'string') return null;
  let value = raw.trim();
  if (!value || value.length > 512) return null;
  for (let i = 0; i < 2; i++) {
    try {
      const decoded = decodeURIComponent(value);
      if (decoded === value) break;
      value = decoded;
    } catch {
      return null;
    }
  }
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
  if (value.includes('\\') || value.includes('://')) return null;
  return brandFromPath(value.split('?')[0]);
}

function mapAccountToBrand(pathname, slug) {
  let p = pathname || '/';
  if (!p.startsWith('/')) p = `/${p}`;
  const zh = p === '/zh' || p === '/zh/' || p.startsWith('/zh/');
  const rest = zh ? p.replace(/^\/zh\/?/, '/') || '/' : p;
  if (!rest.startsWith('/account')) return null;
  const suffix = rest.endsWith('/') || rest.includes('.') ? rest : `${rest}/`;
  return zh ? `/zh/t/${slug}${suffix}` : `/t/${slug}${suffix}`;
}

function mapSubdomainPath(pathname, slug) {
  let p = pathname || '/';
  if (!p.startsWith('/')) p = `/${p}`;

  const zh = p === '/zh' || p === '/zh/' || p.startsWith('/zh/');
  const rest = zh ? p.replace(/^\/zh\/?/, '/') || '/' : p;

  if (
    rest.startsWith('/faq') ||
    rest.startsWith('/pricing') ||
    rest.startsWith('/privacy') ||
    rest.startsWith('/terms') ||
    rest.startsWith('/unknown-site') ||
    rest.startsWith('/api') ||
    rest.startsWith('/scripts') ||
    rest.startsWith('/t/') ||
    rest.startsWith('/_astro') ||
    rest.startsWith('/brand') ||
    rest === '/favicon.svg' ||
    rest === '/robots.txt'
  ) {
    return null;
  }

  // /account/* on a brand host → brand account shell
  if (rest.startsWith('/account')) {
    return mapAccountToBrand(p, slug);
  }

  if (rest === '/' || rest === '') {
    return zh ? `/zh/t/${slug}/` : `/t/${slug}/`;
  }
  if (rest === '/create' || rest === '/create/') {
    return zh ? `/zh/t/${slug}/create/` : `/t/${slug}/create/`;
  }
  const suffix = rest.endsWith('/') ? rest : `${rest}/`;
  return zh ? `/zh/t/${slug}${suffix}` : `/t/${slug}${suffix}`;
}

function withCookie(res, name, value, maxAge) {
  const headers = new Headers(res.headers);
  const base = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`;
  headers.append('Set-Cookie', maxAge === 0 ? `${base}; Max-Age=0` : `${base}; Max-Age=${maxAge}`);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function setBrandCookie(res, slug) {
  return withCookie(res, BRAND_COOKIE, slug, 60 * 60 * 24 * 7);
}

function clearBrandCookie(res) {
  return withCookie(res, BRAND_COOKIE, '', 0);
}

async function serve(context, targetUrl) {
  const { request, env, rewrite } = context;
  if (typeof rewrite === 'function') {
    return rewrite(targetUrl);
  }
  if (env.ASSETS) {
    return env.ASSETS.fetch(new Request(targetUrl, request));
  }
  return Response.redirect(targetUrl, 302);
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const host = (request.headers.get('host') || url.hostname || '').split(':')[0].toLowerCase();
  const apex = apexFromEnv(env);
  const cookies = parseCookies(request);

  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/scripts/') ||
    url.pathname.startsWith('/_astro/') ||
    url.pathname.startsWith('/brand/') ||
    url.pathname === '/favicon.svg' ||
    url.pathname === '/robots.txt'
  ) {
    return next();
  }

  // Already on a brand path (/t/{slug}/…): keep vt_brand for later /account/* visits.
  const pathBrand = brandFromPath(url.pathname);
  if (pathBrand) {
    const res = await next();
    return setBrandCookie(res, pathBrand);
  }

  const isAccount =
    url.pathname.startsWith('/account') || url.pathname.startsWith('/zh/account');

  let hostBrand = null;
  const isApex = host === apex || host === `www.${apex}`;
  const suffix = `.${apex}`;
  if (!isApex && host.endsWith(suffix)) {
    const sub = host.slice(0, -suffix.length);
    if (sub && sub !== 'www' && !sub.includes('.')) {
      if (!KNOWN_SLUGS.has(sub)) {
        const notFound = new URL('/unknown-site/', url);
        const res = await serve(context, notFound);
        return new Response(res.body, { status: 404, headers: res.headers });
      }
      hostBrand = sub;
    }
  }

  if (isAccount) {
    const cookieBrand =
      cookies[BRAND_COOKIE] && KNOWN_SLUGS.has(cookies[BRAND_COOKIE])
        ? cookies[BRAND_COOKIE]
        : null;
    const nextBrand = brandFromNext(url.searchParams.get('next') || '');
    const slug = hostBrand || cookieBrand || nextBrand;
    if (slug) {
      const mapped = mapAccountToBrand(url.pathname, slug);
      if (mapped) {
        const target = new URL(mapped, url.origin);
        target.search = url.search;
        const res = await serve(context, target);
        return setBrandCookie(res, slug);
      }
    }
    // Apex account (no brand context): clear sticky brand cookie.
    const res = await next();
    return clearBrandCookie(res);
  }

  if (hostBrand) {
    const mapped = mapSubdomainPath(url.pathname, hostBrand);
    if (!mapped) return next();
    const target = new URL(mapped, url.origin);
    target.search = url.search;
    const res = await serve(context, target);
    return setBrandCookie(res, hostBrand);
  }

  // Apex gallery / create: drop brand cookie so hub Account stays hub chrome.
  if (
    isApex &&
    (url.pathname === '/' ||
      url.pathname === '/zh' ||
      url.pathname === '/zh/' ||
      url.pathname.startsWith('/create') ||
      url.pathname.startsWith('/zh/create'))
  ) {
    const res = await next();
    return clearBrandCookie(res);
  }

  return next();
}
