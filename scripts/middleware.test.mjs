import assert from 'node:assert/strict';
import { onRequest } from '../functions/_middleware.js';

const APEX = 'swaystill.com';

async function run(url, { env = { PUBLIC_SITE_APEX: APEX }, headers } = {}) {
  const hostname = new URL(url).hostname;
  let nextCalled = false;
  let rewritten = null;
  const res = await onRequest({
    request: new Request(url, {
      method: 'GET',
      headers: { host: hostname, ...headers },
    }),
    env,
    async next() {
      nextCalled = true;
      return new Response('next', { status: 200 });
    },
    async rewrite(target) {
      rewritten = String(target);
      return new Response('rewritten', { status: 200 });
    },
  });
  return { res, nextCalled, rewritten, location: res.headers.get('location') };
}

const retired = [
  ['https://kiss-cam.swaystill.com/', 'https://swaystill.com/'],
  ['https://kiss-cam.swaystill.com/t/kiss-cam/create/', 'https://swaystill.com/'],
  ['https://kiss-cam.swaystill.com/zh/t/kiss-cam/', 'https://swaystill.com/zh/'],
  ['https://kiss-cam.swaystill.com/zh/account/', 'https://swaystill.com/zh/'],
  ['https://kiss-cam.swaystill.com/account/creations', 'https://swaystill.com/'],
  ['https://swaystill.com/t/kiss-cam/', 'https://swaystill.com/'],
  ['https://swaystill.com/t/kiss-cam/create/', 'https://swaystill.com/'],
  ['https://swaystill.com/zh/t/kiss-cam/', 'https://swaystill.com/zh/'],
  ['https://www.swaystill.com/t/kiss-cam/', 'https://www.swaystill.com/'],
  ['https://www.swaystill.com/zh/t/kiss-cam/create/', 'https://www.swaystill.com/zh/'],
  ['https://viral-templates.pages.dev/t/kiss-cam/', 'https://viral-templates.pages.dev/'],
  ['https://viral-templates.pages.dev/zh/t/kiss-cam/', 'https://viral-templates.pages.dev/zh/'],
];

for (const [url, location] of retired) {
  const hit = await run(url);
  assert.equal(hit.res.status, 301, url);
  assert.equal(hit.location, location, url);
  assert.equal(hit.location.includes('kiss-cam.'), false, url);
  assert.equal(hit.nextCalled, false, url);
  assert.equal(hit.rewritten, null, url);
}

const protocolApex = await run('https://kiss-cam.swaystill.com/zh/t/kiss-cam/', {
  env: { PUBLIC_SITE_APEX: 'https://SwayStill.com/' },
});
assert.equal(protocolApex.res.status, 301);
assert.equal(protocolApex.location, 'https://swaystill.com/zh/');

const defaultApex = await run('https://kiss-cam.viral-templates.pages.dev/', { env: {} });
assert.equal(defaultApex.res.status, 301);
assert.equal(defaultApex.location, 'https://viral-templates.pages.dev/');

for (const path of [
  '/api/jobs',
  '/scripts/login-modal.js',
  '/_astro/page.js',
  '/brand/templates/kiss-cam-demo.mp4',
  '/favicon.svg',
  '/robots.txt',
]) {
  const skipped = await run(`https://kiss-cam.swaystill.com${path}`);
  assert.equal(skipped.nextCalled, true, path);
  assert.equal(skipped.res.status, 200, path);
  assert.equal(skipped.location, null, path);
}

for (const slug of ['bby-wow', 'tiny-desk', 'ceiling-fan']) {
  const home = await run(`https://${slug}.swaystill.com/`);
  assert.equal(home.res.status, 200, slug);
  assert.equal(home.location, null, slug);
  assert.equal(home.nextCalled, false, slug);
  assert.equal(home.rewritten, `https://${slug}.swaystill.com/t/${slug}/`, slug);

  const zh = await run(`https://${slug}.swaystill.com/zh/`);
  assert.equal(zh.res.status, 200, slug);
  assert.equal(zh.location, null, slug);
  assert.equal(zh.rewritten, `https://${slug}.swaystill.com/zh/t/${slug}/`, slug);

  const create = await run(`https://${slug}.swaystill.com/create/`);
  assert.equal(create.location, null, slug);
  assert.equal(create.rewritten, `https://${slug}.swaystill.com/t/${slug}/create/`, slug);
}

const apexHome = await run('https://swaystill.com/');
assert.equal(apexHome.nextCalled, true);
assert.equal(apexHome.res.status, 200);
assert.equal(apexHome.location, null);

const livePath = await run('https://swaystill.com/t/bby-wow/');
assert.equal(livePath.nextCalled, true);
assert.equal(livePath.res.status, 200);
assert.equal(livePath.location, null);

const unknown = await run('https://not-a-template.swaystill.com/');
assert.equal(unknown.res.status, 404);
assert.equal(unknown.location, null);
assert.equal(unknown.rewritten, 'https://not-a-template.swaystill.com/unknown-site/');

console.log('middleware tests passed');
