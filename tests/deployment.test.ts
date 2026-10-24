import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedRequest } from '../server/request-origin';
import { getVersions } from '../server/versions';

test('accepts same-origin local and explicitly configured HTTPS deployment hosts', () => {
  const hosts = ['localhost', '127.0.0.1', 'demo.vercel.app'];
  assert.equal(isAllowedRequest('localhost:3000', 'http://localhost:3000', hosts), true);
  assert.equal(isAllowedRequest('demo.vercel.app', 'https://demo.vercel.app', hosts), true);
  assert.equal(isAllowedRequest('demo.vercel.app', undefined, hosts), true);
  assert.equal(isAllowedRequest('demo.vercel.app', 'http://demo.vercel.app', hosts), false);
  assert.equal(isAllowedRequest('demo.vercel.app', 'https://other.vercel.app', hosts), false);
  assert.equal(isAllowedRequest('unrelated.example', undefined, hosts), false);
  assert.equal(isAllowedRequest(undefined, undefined, hosts), false);
});

test('version history returns bounded public commit/deployment links without credentials', async () => {
  const sha = 'a'.repeat(40);
  const history = await getVersions(async (url, init) => {
    assert.match(String(url), /^https:\/\/api.github.com\/repos\/finngck\/Hacktober\//);
    assert.equal('Authorization' in (init?.headers as object), false);
    const data = String(url).includes('/statuses')
      ? [{ state: 'success', environment_url: 'https://demo.vercel.app' }]
      : String(url).includes('/deployments?')
        ? [{ id: 1, sha, environment: 'Preview', created_at: '2026-10-24T12:00:00Z' }]
        : [
            {
              sha,
              commit: { message: 'Feature\nDetails', committer: { date: '2026-10-24T12:00:00Z' } },
            },
          ];
    return new Response(JSON.stringify(data), { status: 200 });
  });
  assert.equal(history.available, true);
  assert.equal(history.commits[0].message, 'Feature');
  assert.equal(history.deployments[0].url, 'https://demo.vercel.app/');
});

test('version history fails gracefully on GitHub limits and rejects unsafe deployment URLs', async () => {
  assert.equal((await getVersions(async () => new Response('', { status: 403 }))).available, false);
  const history = await getVersions(
    async (url) =>
      new Response(
        JSON.stringify(
          String(url).includes('/statuses')
            ? [
                {
                  state: 'success',
                  environment_url: 'https://demo.vercel.app/?secret=not-for-display',
                },
              ]
            : String(url).includes('/deployments?')
              ? [
                  {
                    id: 1,
                    sha: 'a'.repeat(40),
                    environment: 'Preview',
                    created_at: '2026-10-24T12:00:00Z',
                  },
                ]
              : [],
        ),
        { status: 200 },
      ),
  );
  assert.deepEqual(history.deployments, []);
});
