/**
 * Host → /t/{slug}/ rewrite for Cloudflare Pages.
 *
 * Production: bind wildcard DNS `*.yourapex.com` → this Pages project,
 * set env PUBLIC_SITE_APEX=yourapex.com (no protocol).
 *
 * Test with Host header (after deploy / wrangler pages dev):
 *   curl -sI -H "Host: bby-wow.example.com" https://viral-templates.pages.dev/
 *   npx wrangler pages dev dist
 *   curl -sI -H "Host: bby-wow.viral-templates.pages.dev" http://127.0.0.1:8788/
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

function apexFromEnv(env) {
  const raw = (env && env.PUBLIC_SITE_APEX) || 'viral-templates.pages.dev';
  return String(raw)
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '')
    .toLowerCase();
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
    rest.startsWith('/t/') ||
    rest.startsWith('/_astro') ||
    rest.startsWith('/brand') ||
    rest === '/favicon.svg' ||
    rest === '/robots.txt'
  ) {
    return null;
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

export async function onRequest(context) {
  const { request, env, next, rewrite } = context;
  const url = new URL(request.url);
  const host = (request.headers.get('host') || url.hostname || '').split(':')[0].toLowerCase();
  const apex = apexFromEnv(env);

  if (
    url.pathname.startsWith('/t/') ||
    url.pathname.startsWith('/zh/t/') ||
    url.pathname.startsWith('/_astro/') ||
    url.pathname.startsWith('/brand/') ||
    url.pathname === '/favicon.svg' ||
    url.pathname === '/robots.txt'
  ) {
    return next();
  }

  if (host === apex || host === `www.${apex}`) {
    return next();
  }

  const suffix = `.${apex}`;
  if (!host.endsWith(suffix)) {
    return next();
  }

  const sub = host.slice(0, -suffix.length);
  if (!sub || sub === 'www' || sub.includes('.')) {
    return next();
  }

  if (!KNOWN_SLUGS.has(sub)) {
    const notFound = new URL('/unknown-site/', url);
    if (typeof rewrite === 'function') {
      const res = await rewrite(notFound);
      return new Response(res.body, { status: 404, headers: res.headers });
    }
    if (env.ASSETS) {
      const res = await env.ASSETS.fetch(new Request(notFound, request));
      return new Response(res.body, { status: 404, headers: res.headers });
    }
    return Response.redirect(notFound, 302);
  }

  const mapped = mapSubdomainPath(url.pathname, sub);
  if (!mapped) return next();

  const target = new URL(mapped, url.origin);
  target.search = url.search;

  if (typeof rewrite === 'function') {
    return rewrite(target);
  }
  if (env.ASSETS) {
    return env.ASSETS.fetch(new Request(target, request));
  }
  return Response.redirect(target, 302);
}
