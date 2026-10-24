import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { once } from 'node:events';
import { chromium, webkit, type Browser, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { createApp } from '../../server/app.js';
import { demoCheckIn, demoPlan } from '../../shared/demo.js';
import { selectMeasures } from '../../shared/measures.js';
import type { ReplanRequest, ScheduleItem } from '../../shared/contracts.js';

let browser: Browser;
let vite: ViteDevServer;
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let origin: string;

before(async () => {
  const app = createApp({ apiKey: '', model: 'synthetic-test' });
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

async function openDay(width = 1440, lowEnergy = false) {
  const page = await browser.newPage({
    viewport: { width, height: 1000 },
    timezoneId: 'Europe/Berlin',
    reducedMotion: 'reduce',
  });
  await page.clock.install({ time: new Date('2026-10-24T13:00:00+02:00') });
  await page.addInitScript(
    ({ plan, checkIn }) => {
      if (localStorage.getItem('daylight.workspace.v1')) return;
      // Legacy saved workspaces have no dismissal field and must still load.
      localStorage.setItem(
        'daylight.workspace.v1',
        JSON.stringify({ version: 1, plan, checkIn, history: [] }),
      );
      localStorage.setItem(
        'daylight.progress.v1',
        JSON.stringify({ version: 1, checkInDays: ['2026-10-24'], acceptedPlans: 0, badges: [] }),
      );
    },
    { plan: demoPlan, checkIn: { ...demoCheckIn, energy: lowEnergy ? 'low' : demoCheckIn.energy } },
  );
  await page.goto(`${origin}/app.html`);
  await page.getByRole('region', { name: 'For you right now' }).waitFor();
  return page;
}

async function mockBreakProposal(page: Page) {
  await page.route('**/api/replan', async (route) => {
    const request = route.request().postDataJSON() as ReplanRequest;
    const item: ScheduleItem = {
      id: 'tip-rest-break',
      title: 'Rest break',
      category: 'recovery',
      start: 780,
      duration: request.message.includes('25-minute') ? 25 : 15,
      fixed: false,
      priority: 'medium',
      effort: 'low',
      deadline: null,
      tags: [],
    };
    await route.fulfill({
      json: {
        result: {
          status: 'proposal',
          summary: 'A rest break fits before your next task.',
          availabilityFrom: request.plan.availableFrom,
          energy: request.checkIn.energy,
          sleepHours: request.checkIn.sleepHours,
          question: null,
          placements: [{ id: item.id, start: item.start, reason: 'Room for a break.' }],
        },
        proposedPlan: { ...request.plan, items: [...request.plan.items, item] },
        measures: selectMeasures(request, request.checkIn),
        meta: { model: 'synthetic-test', elapsedMs: 1, attempts: 1 },
      },
    });
  });
}

for (const width of [390, 1440]) {
  test(`${width}px: review and apply a break; the tip survives applying, undo and reload`, async () => {
    const page = await openDay(width);
    try {
      await mockBreakProposal(page);
      const tip = page.getByRole('region', { name: 'For you right now' });
      const checkIn = page.locator('#check-in-title').locator('..').locator('..');
      const checkInBox = (await checkIn.boundingBox())!;
      assert.ok((await tip.boundingBox())!.y >= checkInBox.y + checkInBox.height);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        true,
      );
      const before = await page.evaluate(() => localStorage.getItem('daylight.workspace.v1'));
      if (process.env.TIP_SCREENSHOTS_DIR) {
        await page.screenshot({
          path: `${process.env.TIP_SCREENSHOTS_DIR}/tips-${width}.png`,
          fullPage: true,
        });
        await tip.screenshot({ path: `${process.env.TIP_SCREENSHOTS_DIR}/tip-card-${width}.png` });
      }
      const button = tip.getByRole('button', { name: 'Pause einplanen' });
      await button.focus();
      const requested = page.waitForRequest('**/api/replan');
      await page.keyboard.press('Enter');
      const payload = (await requested).postDataJSON();
      assert.match(payload.message, /15-minute rest break/);
      assert.deepEqual(payload.conversation, []);
      await page.getByRole('button', { name: 'Apply plan', exact: true }).waitFor();
      assert.equal(
        await page.evaluate(() => localStorage.getItem('daylight.workspace.v1')),
        before,
      );
      await page.getByRole('button', { name: 'Apply plan', exact: true }).click();
      await tip.waitFor();
      await page.reload();
      await tip.waitFor();
      const items = await page.evaluate(
        () => JSON.parse(localStorage.getItem('daylight.workspace.v1')!).plan.items,
      );
      assert.equal(items.filter((item: ScheduleItem) => item.id === 'tip-rest-break').length, 1);
      await page.getByRole('button', { name: 'Undo last change', exact: true }).click();
      await tip.waitFor();
    } finally {
      await page.close();
    }
  });
}

test('hide for today survives reload and expires on the next calendar day', async () => {
  const page = await openDay();
  try {
    await page.getByRole('button', { name: 'Heute ausblenden' }).click();
    await page.getByRole('region', { name: 'For you right now' }).waitFor({ state: 'hidden' });
    await page.reload();
    await page.getByRole('heading', { name: 'Daily Check-in', exact: true }).waitFor();
    assert.equal(await page.getByRole('region', { name: 'For you right now' }).count(), 0);
    await page.clock.setSystemTime(new Date('2026-10-25T13:00:00+01:00'));
    await page.evaluate(() => {
      const progress = JSON.parse(localStorage.getItem('daylight.progress.v1')!);
      progress.checkInDays.push('2026-10-25');
      localStorage.setItem('daylight.progress.v1', JSON.stringify(progress));
    });
    await page.reload();
    await page.getByRole('region', { name: 'For you right now' }).waitFor();
  } finally {
    await page.close();
  }
});

test('a nap uses its existing duration; failed planning leaves the tip and plan intact', async () => {
  const page = await openDay(390, true);
  try {
    const tip = page.getByRole('region', { name: 'For you right now' });
    assert.match(await tip.innerText(), /Tactical Nap/i);
    const before = await page.evaluate(() => localStorage.getItem('daylight.workspace.v1'));
    await page.route('**/api/replan', (route) =>
      route.fulfill({ status: 503, json: { error: 'Please try again later.' } }),
    );
    const requested = page.waitForRequest('**/api/replan');
    await tip.getByRole('button', { name: 'Pause einplanen' }).click();
    assert.match((await requested).postDataJSON().message, /25-minute rest break/);
    await page.getByRole('alert').waitFor();
    assert.equal(await tip.getByRole('button', { name: 'Pause einplanen' }).isEnabled(), true);
    assert.equal(await page.evaluate(() => localStorage.getItem('daylight.workspace.v1')), before);
    await page.reload();
    await tip.waitFor();
  } finally {
    await page.close();
  }
});
