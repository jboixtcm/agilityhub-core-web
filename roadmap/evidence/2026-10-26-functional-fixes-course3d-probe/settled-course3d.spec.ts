import { writeFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

const evidence = '/evidence/2026-10-26-functional-fixes-course3d-probe';

// Instrument draw completion only; this is not a pixel-count proxy for model correctness.
// The retained original screenshots are reviewed manually after real FBX/network readiness.
for (const theme of ['light', 'dark'] as const) {
  test(`real WebGL scene after placement edits, settled ${theme}`, async ({ page }) => {
    test.setTimeout(90000);
    const modelResponses: { path: string; status: number }[] = [];
    const failures: string[] = [];
    const errors: string[] = [];
    page.on('response', (response) => {
      if (/\.fbx(?:\?|$)/u.test(response.url())) {
        modelResponses.push({ path: new URL(response.url()).pathname, status: response.status() });
      }
    });
    page.on('requestfailed', (request) => {
      if (/\.fbx(?:\?|$)/u.test(request.url())) failures.push(new URL(request.url()).pathname);
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const probe = { draws: 0, contextsLost: 0 };
      Object.assign(window, { course3dProbe: probe });
      const seen = new WeakSet<object>();
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        const context = Reflect.apply(original, this, args);
        if (context !== null && String(args[0]).startsWith('webgl') && !seen.has(context)) {
          seen.add(context);
          this.addEventListener('webglcontextlost', () => { probe.contextsLost += 1; });
          for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
            const native = context[name];
            if (typeof native !== 'function') continue;
            context[name] = function (...drawArgs: unknown[]) {
              const value = Reflect.apply(native, this, drawArgs);
              probe.draws += 1;
              return value;
            };
          }
        }
        return context;
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    const probe = () => page.evaluate(() => (window as unknown as { course3dProbe: { draws: number; contextsLost: number } }).course3dProbe);
    const settle = async () => {
      await page.waitForLoadState('networkidle');
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      });
    };
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(`http://127.0.0.1:4177/?theme=${theme}`);
    const canvas = page.getByRole('img', { name: 'Recorregut en 3D' }).locator('canvas');
    await expect(canvas).toBeVisible();
    await settle();
    expect(modelResponses.length).toBeGreaterThan(0);
    expect(modelResponses.every((response) => response.status === 200)).toBe(true);
    expect(failures).toEqual([]);
    const before = await probe();
    expect(before.draws).toBeGreaterThan(0);
    await page.screenshot({ path: `${evidence}/${theme}-before.png` });
    await canvas.screenshot({ path: `${evidence}/${theme}-before-canvas.png` });

    const svgIcon = page.getByRole('img', { name: 'Recorregut en 2D' }).locator('g[transform*="rotate("]').first();
    const transformBefore = await svgIcon.getAttribute('transform');
    await page.getByLabel('Pas').selectOption({ label: '1,00 m' });
    for (let step = 0; step < 3; step += 1) await page.getByRole('button', { name: 'Mou a la dreta' }).click();
    expect(await svgIcon.getAttribute('transform')).not.toBe(transformBefore);
    await expect.poll(async () => (await probe()).draws).toBeGreaterThan(before.draws);
    await settle();
    const after = await probe();
    await page.screenshot({ path: `${evidence}/${theme}-after-three-nudges.png` });
    await canvas.screenshot({ path: `${evidence}/${theme}-after-three-nudges-canvas.png` });
    expect(after.contextsLost).toBe(0);
    expect(errors).toEqual([]);
    expect(failures).toEqual([]);
    writeFileSync(`${evidence}/${theme}-readiness.json`, JSON.stringify({
      theme, modelResponses, failures, errors, before, after,
      settle: 'actual FBX HTTP responses, networkidle, document.fonts.ready, two animation frames; observed real WebGL draws after edit',
      limit: 'Draw calls establish a completed render, not model correctness; original PNGs need manual visual review.',
    }, null, 2) + '\n');
  });
}
