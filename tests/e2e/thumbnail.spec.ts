import { expect, type Page, test } from '@playwright/test';

type Thumbnail = HTMLElement & {
  engine: { loadMediaAt(time: number): void } | null;
  frameTime: number;
};

type Media = HTMLElement & {
  engine: { levels: Array<{ width: number; height: number }>; autoLevelCapping: number } | null;
  source: Record<string, unknown> | null;
  src: string;
};

declare global {
  interface Window {
    recorded: { loads: number[]; frames: number[] };
  }
}

async function waitForEngine(page: Page, timeout = 30_000) {
  await page.waitForFunction(() => !!(document.getElementById('thumbnail') as Thumbnail | null)?.engine, null, {
    timeout,
  });
}

async function record(page: Page) {
  await page.evaluate(() => {
    const element = document.getElementById('thumbnail') as Thumbnail;
    const engine = element.engine!;
    const loadMediaAt = engine.loadMediaAt.bind(engine);

    window.recorded = { loads: [], frames: [] };
    engine.loadMediaAt = (time) => {
      window.recorded.loads.push(time);
      loadMediaAt(time);
    };
    element.addEventListener('frame-change', () => window.recorded.frames.push(element.frameTime));
  });
}

const loads = (page: Page) => page.evaluate(() => window.recorded.loads.slice());
const frames = (page: Page) => page.evaluate(() => window.recorded.frames.slice());

async function hoverSlider(page: Page, fraction: number) {
  const box = (await page.locator('media-time-slider').boundingBox())!;
  await page.mouse.move(box.x + box.width * fraction, box.y + box.height / 2, { steps: 4 });
}

test('demo: hovering the time slider shows an I-frame near the hovered time', async ({ page }) => {
  await page.goto('/');
  await waitForEngine(page);
  await record(page);

  await page.locator('video-skin').hover();
  await hoverSlider(page, 0.5);
  await expect.poll(() => frames(page), { timeout: 15_000 }).not.toHaveLength(0);

  const requested = (await loads(page)).at(-1)!;
  const rendered = (await frames(page)).at(-1)!;
  // I-frames sit a few seconds apart; the frame shown is the one at or just before the request.
  expect(rendered).toBeLessThanOrEqual(requested + 0.5);
  expect(requested - rendered).toBeLessThan(15);
  await expect(page.locator('#thumbnail')).toHaveAttribute('data-renderer', 'video');
  await expect(page.locator('#thumbnail')).toBeVisible();

  // Leaving the slider stops frame requests while playback continues.
  await page.mouse.move(10, 10);
  const settled = (await loads(page)).length;
  await page.waitForTimeout(2_000);
  expect(await loads(page)).toHaveLength(settled);
});

test("the I-frame player does not take over the main engine's rendition cap", async ({ page }) => {
  await page.goto('/');
  await waitForEngine(page);

  const result = await page.evaluate(async () => {
    const video = document.getElementById('video') as Media;
    const engine = video.engine!;
    const levelFor360p = engine.levels.reduce(
      (best, level, i) => (level.width * level.height <= 640 * 360 ? i : best),
      0
    );

    video.source = { ...(video.source ?? { src: video.src }), maxAutoResolution: '360p' };
    await new Promise((resolve) => setTimeout(resolve, 100));

    return { levelFor360p, capped: engine.autoLevelCapping, sameEngine: video.engine === engine };
  });

  expect(result.sameEngine).toBe(true);
  expect(result.capped).toBe(result.levelFor360p);
});

test('a thumbnail added after playback started still gets a player', async ({ page }) => {
  await page.goto('/');
  await waitForEngine(page);

  await page.evaluate(() => {
    const fresh = document.createElement('hlsjs-iframe-slider-thumbnail');
    fresh.id = 'thumbnail';
    fresh.slot = 'thumbnail';
    document.getElementById('thumbnail')!.replaceWith(fresh);
  });
  await waitForEngine(page, 5_000);
});

test('custom slider: the thumbnail follows a hand-built <media-time-slider>', async ({ page }) => {
  await page.goto('/custom.html');
  await waitForEngine(page);
  await record(page);

  await hoverSlider(page, 0.7);
  await expect.poll(() => frames(page), { timeout: 15_000 }).not.toHaveLength(0);
  await expect(page.locator('#thumbnail')).toHaveCSS('opacity', '1');
});

test('react: the element works inside a React 19 tree', async ({ page }) => {
  await page.goto('/react.html');
  await waitForEngine(page);
  await record(page);

  await page.locator('video-skin').hover();
  await hoverSlider(page, 0.5);
  await expect.poll(() => frames(page), { timeout: 15_000 }).not.toHaveLength(0);
});

test('switching streams on the same engine rebuilds the I-frame player', async ({ page }) => {
  await page.goto('/advanced.html');
  await waitForEngine(page);
  const before = await page.evaluateHandle(() => ({
    engine: (document.getElementById('thumbnail') as Thumbnail).engine,
    main: (document.getElementById('video') as Media).engine,
  }));

  await page.locator('#preset').selectOption('bbb');

  await page.waitForFunction(
    (b) => {
      const { engine } = document.getElementById('thumbnail') as Thumbnail;
      return !!engine && engine !== b.engine;
    },
    before,
    { timeout: 30_000 }
  );
  // Video.js keeps the hls.js instance when only the URL changes.
  expect(await page.evaluate((b) => (document.getElementById('video') as Media).engine === b.main, before)).toBe(true);
});

test('MJPG I-frame variants render through the image player', async ({ page }) => {
  await page.goto('/advanced.html');
  await waitForEngine(page);
  await page.locator('#preset').selectOption('apple-dv-atmos');
  await expect(page.locator('#thumbnail')).toHaveAttribute('data-renderer', 'image', { timeout: 40_000 });
  await record(page);

  await page.locator('video-skin').hover();
  await hoverSlider(page, 0.4);
  await expect.poll(() => frames(page), { timeout: 20_000 }).not.toHaveLength(0);

  await expect(page.locator('#variants tr[data-active]')).toHaveCount(1, { timeout: 20_000 });
  await expect(page.locator('#variants tr[data-active] td').nth(3)).toHaveText('mjpg');
});
