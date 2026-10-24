import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { chromium, webkit, type Browser, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { createApp } from '../../server/app.js';
import { MAX_IMAGE_BASE64_LENGTH, type ExtractResponse } from '../../shared/contracts.js';

const extracted: ExtractResponse = {
  tasks: [
    {
      title: 'Study statistics',
      category: 'study',
      duration: 45,
      start: null,
      deadline: null,
      priority: 'medium',
      fixed: false,
      when: null,
    },
  ],
  note: null,
  meta: { model: 'gemma-4-test', elapsedMs: 1, attempts: 1 },
};

let browser: Browser;
let vite: ViteDevServer;
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let origin: string;

before(async () => {
  const app = createApp({
    apiKey: 'synthetic-test-key',
    model: 'gemma-4-test',
    fetcher: async () =>
      Response.json({
        candidates: [{ content: { parts: [{ text: JSON.stringify(extracted) }] } }],
      }),
  });
  vite = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'spa',
  });
  app.use(vite.middlewares);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  browser = await (process.env.UPLOAD_BROWSER === 'webkit' ? webkit : chromium).launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  });
});

after(async () => {
  await browser?.close();
  await vite?.close();
  server?.closeAllConnections();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
});

async function openImport() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(() => {
    const now = new Date();
    const today = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
      .map((value) => String(value).padStart(2, '0'))
      .join('-');
    localStorage.setItem(
      'daylight.progress.v1',
      JSON.stringify({ version: 1, checkInDays: [today], acceptedPlans: 0, badges: [] }),
    );
  });
  await page.goto(`${origin}/app.html`);
  await page.getByRole('button', { name: 'Screenshot', exact: true }).click();
  return page;
}

async function fixture(page: Page, mimeType = 'image/png', transparent = false, noise = false) {
  // WebKit's canvas silently falls back to PNG when asked to encode WebP.
  if (mimeType === 'image/webp') {
    return {
      name: 'tasks.webp',
      mimeType,
      buffer: await readFile(new URL('./fixtures/tasks.webp', import.meta.url)),
    };
  }
  const base64 = await page.evaluate(
    ({ mimeType, transparent, noise }) => {
      const canvas = document.createElement('canvas');
      canvas.width = noise ? 2400 : 1100;
      canvas.height = noise ? 1600 : 550;
      const context = canvas.getContext('2d')!;
      if (!transparent) {
        context.fillStyle = 'white';
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      if (noise) {
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        let seed = 42;
        for (let i = 0; i < pixels.data.length; i++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          pixels.data[i] = i % 4 === 3 ? 255 : seed >>> 24;
        }
        context.putImageData(pixels, 0, 0);
      }
      context.fillStyle = 'black';
      context.font = '32px sans-serif';
      context.fillText('Aufgabenliste', 45, 65);
      context.fillText('Study statistics - 45 minutes', 45, 135);
      return canvas.toDataURL(mimeType).split(',')[1];
    },
    { mimeType, transparent, noise },
  );
  return {
    name: `test.${mimeType.split('/')[1]}`,
    mimeType,
    buffer: Buffer.from(base64, 'base64'),
  };
}

for (const mimeType of ['image/png', 'image/jpeg', 'image/webp']) {
  test(`${mimeType}: upload, review, edit and add exactly once, including after reload`, async () => {
    const page = await openImport();
    try {
      const before = await page.evaluate(() => localStorage.getItem('daylight.workspace.v1'));
      await page.locator('input[type=file]').setInputFiles(await fixture(page, mimeType));
      const title = page.getByRole('textbox', { name: 'Title', exact: true });
      await title.waitFor();
      assert.equal(await title.inputValue(), 'Study statistics');
      assert.equal(
        await page.evaluate(() => localStorage.getItem('daylight.workspace.v1')),
        before,
      );
      await title.fill('Reviewed study task');
      await page.getByRole('button', { name: 'Add selected' }).click();
      await page.getByRole('dialog', { name: 'Import screenshot' }).waitFor({ state: 'hidden' });
      await page.reload();
      await page.getByRole('button', { name: 'Screenshot', exact: true }).waitFor();
      const titles = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('daylight.workspace.v1')!).plan.items.map(
          (item: { title: string }) => item.title,
        ),
      );
      assert.equal(titles.filter((title: string) => title === 'Reviewed study task').length, 1);
    } finally {
      await page.close();
    }
  });
}

test('transparent screenshots retain white background and dark text', async () => {
  const page = await openImport();
  try {
    const request = page.waitForRequest('**/api/extract');
    await page.locator('input[type=file]').setInputFiles(await fixture(page, 'image/png', true));
    const payload = (await request).postDataJSON();
    const pixels = await page.evaluate(async (payload) => {
      const bitmap = await createImageBitmap(
        await (await fetch(`data:${payload.mimeType};base64,${payload.image}`)).blob(),
      );
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const background = [...context.getImageData(0, 0, 1, 1).data];
      const text = context.getImageData(40, 100, 500, 50).data;
      return { background, hasDarkText: text.some((channel, i) => i % 4 !== 3 && channel < 50) };
    }, payload);
    assert.deepEqual(pixels.background, [255, 255, 255, 255]);
    assert.equal(pixels.hasDarkText, true);
  } finally {
    await page.close();
  }
});

test('large noisy screenshots fit the API limit after compression', async () => {
  const page = await openImport();
  try {
    const file = await fixture(page, 'image/png', false, true);
    assert.ok(file.buffer.length > 3_000_000);
    const request = page.waitForRequest('**/api/extract');
    await page.locator('input[type=file]').setInputFiles(file);
    const payload = (await request).postDataJSON();
    assert.ok(payload.image.length <= MAX_IMAGE_BASE64_LENGTH);
    await page.getByRole('textbox', { name: 'Title', exact: true }).waitFor();
  } finally {
    await page.close();
  }
});

test('closing an in-flight upload allows a new one and ignores the late result', async () => {
  const page = await openImport();
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  let flushed!: () => void;
  const lateResponse = new Promise<void>((resolve) => (flushed = resolve));
  try {
    let count = 0;
    await page.route('**/api/extract', async (route) => {
      const first = ++count === 1;
      if (first) await held;
      await route.fulfill({
        json: {
          ...extracted,
          tasks: [
            { ...extracted.tasks[0], title: first ? 'Veraltetes Ergebnis' : 'Neues Ergebnis' },
          ],
        },
      });
      if (first) flushed();
    });
    const file = await fixture(page);
    const firstRequest = page.waitForRequest('**/api/extract');
    await page.locator('input[type=file]').setInputFiles(file);
    await firstRequest;
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Screenshot', exact: true }).click();
    assert.equal(await page.locator('input[type=file]').isEnabled(), true);
    await page.locator('input[type=file]').setInputFiles(file);
    await page.getByRole('textbox', { name: 'Title', exact: true }).waitFor();
    release();
    await lateResponse;
    assert.equal(
      await page.getByRole('textbox', { name: 'Title', exact: true }).inputValue(),
      'Neues Ergebnis',
    );
  } finally {
    release();
    await page.close();
  }
});

test('closing during image decoding prevents the old file from being uploaded', async () => {
  const page = await openImport();
  try {
    let requests = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/api/extract')) requests++;
    });
    await page.evaluate(() => {
      const state = window as typeof window & { finishDecoding: () => void };
      const decode = window.createImageBitmap.bind(window);
      window.createImageBitmap = async (source: ImageBitmapSource) => {
        window.createImageBitmap = decode;
        const bitmap = await decode(source);
        await new Promise<void>((resolve) => {
          state.finishDecoding = resolve;
        });
        return bitmap;
      };
    });
    const file = await fixture(page);
    await page.locator('input[type=file]').setInputFiles(file);
    await page.waitForFunction(() => 'finishDecoding' in window);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Screenshot', exact: true }).click();
    await page.locator('input[type=file]').setInputFiles(file);
    await page.getByRole('textbox', { name: 'Title', exact: true }).waitFor();
    await page.evaluate(() =>
      (window as typeof window & { finishDecoding: () => void }).finishDecoding(),
    );
    assert.equal(requests, 1);
    assert.equal(await page.locator('input[type=file]').isEnabled(), true);
  } finally {
    await page.close();
  }
});

test('empty recognition leaves the plan unchanged and offers no add action', async () => {
  const page = await openImport();
  try {
    const before = await page.evaluate(() => localStorage.getItem('daylight.workspace.v1'));
    await page.route('**/api/extract', (route) =>
      route.fulfill({ json: { ...extracted, tasks: [] } }),
    );
    await page.locator('input[type=file]').setInputFiles(await fixture(page));
    await page.getByText('No tasks or appointments were found in the image.').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Add selected' }).count(), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem('daylight.workspace.v1')), before);
  } finally {
    await page.close();
  }
});

test('bad files fail before upload and the same valid file can be selected again', async () => {
  const page = await openImport();
  try {
    let requests = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/api/extract')) requests++;
    });
    for (const file of [
      { name: 'empty.png', mimeType: 'image/png', buffer: Buffer.alloc(0) },
      { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('broken image') },
      { name: 'wrong.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') },
      { name: 'huge.png', mimeType: 'image/png', buffer: Buffer.alloc(20 * 1024 * 1024 + 1) },
    ]) {
      await page.locator('input[type=file]').setInputFiles(file);
      await page.getByRole('alert').waitFor();
      assert.equal(await page.locator('input[type=file]').isEnabled(), true);
    }
    assert.equal(requests, 0);
    const file = await fixture(page);
    for (let i = 0; i < 2; i++) {
      await page.locator('input[type=file]').setInputFiles(file);
      await page.getByRole('textbox', { name: 'Title', exact: true }).waitFor();
    }
    assert.equal(requests, 2);
  } finally {
    await page.close();
  }
});

test('HTTP, non-JSON, invalid model and network errors are readable and retryable', async () => {
  const page = await openImport();
  try {
    const file = await fixture(page);
    for (const failure of ['http', 'html', 'schema', 'network']) {
      await page.route('**/api/extract', async (route) => {
        if (failure === 'network') return route.abort('failed');
        if (failure === 'http')
          return route.fulfill({ status: 429, json: { error: 'Please try again later.' } });
        if (failure === 'html')
          return route.fulfill({
            status: 504,
            contentType: 'text/html',
            body: '<h1>Gateway timeout</h1>',
          });
        return route.fulfill({ json: { tasks: 'invalid' } });
      });
      await page.locator('input[type=file]').setInputFiles(file);
      await page.getByRole('alert').waitFor();
      assert.match(await page.getByRole('alert').innerText(), /again/i);
      assert.equal(await page.locator('input[type=file]').isEnabled(), true);
      await page.unroute('**/api/extract');
    }
    await page.locator('input[type=file]').setInputFiles(file);
    await page.getByRole('textbox', { name: 'Title', exact: true }).waitFor();
  } finally {
    await page.close();
  }
});

test('a hanging upload times out and allows retry', async () => {
  const page = await openImport();
  try {
    await page.clock.install();
    await page.route('**/api/extract', () => {});
    const request = page.waitForRequest('**/api/extract');
    await page.locator('input[type=file]').setInputFiles(await fixture(page));
    await request;
    await page.clock.fastForward(65_001);
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').innerText(), /too long/);
    assert.equal(await page.locator('input[type=file]').isEnabled(), true);
  } finally {
    await page.close();
  }
});
