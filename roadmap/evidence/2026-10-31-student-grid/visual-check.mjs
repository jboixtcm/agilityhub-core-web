import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, webkit, expect } from '@playwright/test';

const evidence = import.meta.dirname;
const branding = JSON.parse(readFileSync(resolve(evidence, '../../../packages/api-client/src/mocks/fixtures/branding-canic.json'), 'utf8'));
const base = 'http://127.0.0.1:4174';
const results = [];
for (const engine of ['chromium', 'webkit']) {
  const browser = await (engine === 'chromium' ? chromium.launch({channel: 'chrome'}) : webkit.launch());
  try {
    const page = await browser.newPage({ viewport: {width: 1280, height: 900} });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-08-03T08:50:00+02:00'));
    await page.addInitScript(cached => {
      localStorage.setItem('agilityhub.locale', 'ca');
      localStorage.setItem('agilityhub.mockScenario', 'instructor');
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cached));
    }, branding);
    await page.goto(`${base}/entrar`);
    await page.getByLabel('Correu electrònic').fill('instructor@example.test');
    await page.getByRole('button', {name: 'Tinc contrasenya'}).click();
    await page.getByLabel('Contrasenya').fill('secret-password');
    await page.getByRole('button', {name: 'ENTRA', exact: true}).click();
    await page.waitForURL(/\/(tauler|agenda)$/u);
    await page.goto(`${base}/alumnes`);
    const grid = page.getByRole('button', {name: 'Vista de graella'});
    const list = page.getByRole('button', {name: 'Vista de llista'});
    const items = page.locator('.students-page__student');
    await expect(items.first()).toBeVisible();
    await expect(grid).toHaveAttribute('aria-pressed', 'true');
    const initialCount = await items.count();
    await page.getByRole('button', {name: "Mostra'n més"}).click();
    await expect.poll(() => items.count()).toBeGreaterThan(initialCount);
    const expandedCount = await items.count();
    await list.click();
    await expect(list).toHaveAttribute('aria-pressed', 'true');
    await expect(items).toHaveCount(expandedCount);
    await page.reload();
    await expect(list).toHaveAttribute('aria-pressed', 'true');
    await expect(items.first()).toBeVisible();
    await page.getByRole('combobox', {name: 'Ordena per'}).selectOption('ownerLastName,asc');
    await page.getByPlaceholder('Cerca un alumne').fill('Duna');
    await expect.poll(async () => { const names = await items.allTextContents(); return names.length > 0 && names.every(name => name.includes('Duna')); }).toBe(true);
    const searchCount = await items.count();
    await grid.click();
    await expect(page.getByPlaceholder('Cerca un alumne')).toHaveValue('Duna');
    await expect(page.getByRole('combobox', {name: 'Ordena per'})).toHaveValue('ownerLastName,asc');
    await expect(items).toHaveCount(searchCount);
    await expect(page.getByRole('link', {name: 'Laura + Duna · C', exact: true}).locator('.students-page__level')).toHaveText('Nivell C');
    await page.getByRole('link', {name: 'Laura + Duna · C', exact: true}).click();
    await expect(page.getByRole('heading', {name: 'Laura + Duna', level: 1})).toBeVisible();
    await page.goBack();
    await expect(grid).toHaveAttribute('aria-pressed', 'true');
    await expect(items).toHaveCount(initialCount);
    for (const theme of ['dark', 'light']) {
      await page.getByRole('combobox', {name: 'Aparença'}).selectOption(theme);
      for (const width of [320, 375, 1280]) {
        await page.setViewportSize({width, height: 900});
        for (const view of ['grid', 'list']) {
          await (view === 'grid' ? grid : list).click();
          await expect(view === 'grid' ? grid : list).toHaveAttribute('aria-pressed', 'true');
          await expect(page.locator(`.students-page__items--${view}`)).toBeVisible();
          await page.mouse.move(0, 0);
          await expect(items.first()).toBeVisible();
          await page.evaluate(() => document.fonts.ready);
          const layout = await page.locator('.students-page').evaluate(section => {
            const first = section.querySelector('.students-page__student');
            const photo = first.querySelector('.ah-dog-photo').getBoundingClientRect();
            const name = first.querySelector('.students-page__name').getBoundingClientRect();
            const badge = first.querySelector('.students-page__level')?.getBoundingClientRect();
            return {
              width: innerWidth,
              scrollWidth: document.documentElement.scrollWidth,
              columns: getComputedStyle(section.querySelector('ul')).gridTemplateColumns,
              avatarAboveName: photo.bottom <= name.top,
              badgeBelowName: !badge || name.bottom <= badge.top,
              buttons: [...section.querySelectorAll('.students-page__view button')].map(b => ({width: b.offsetWidth, height: b.offsetHeight})),
              iconPainted: [...section.querySelectorAll('.students-page__view svg')].every(svg => svg.getBBox().width > 0),
            };
          });
          expect(layout.scrollWidth).toBeLessThanOrEqual(width);
          expect(layout.iconPainted).toBe(true);
          for (const button of layout.buttons) { expect(button.width).toBeGreaterThanOrEqual(44); expect(button.height).toBeGreaterThanOrEqual(44); }
          if (view === 'grid') { expect(layout.avatarAboveName).toBe(true); expect(layout.badgeBelowName).toBe(true); }
          await page.locator('.students-page__view').evaluate(async element => { await Promise.all(element.getAnimations({subtree: true}).map(animation => animation.finished.catch(() => undefined))); });
          if (width !== 320) await page.screenshot({path: resolve(evidence, `${engine}-${view}-${theme}-${width}.png`)});
          results.push({engine, theme, width, view, ...layout});
        }
      }
    }
    await grid.click();
    await items.first().focus();
    await expect(items.first()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/alumnes\/[^/]+$/u);
    expect(errors).toEqual([]);
    results.push({engine, interactions: 'default grid, list persistence, retained pagination/search/sort, badge, record navigation, back navigation and keyboard activation passed', errors});
  } finally {
    await browser.close();
  }
}
writeFileSync(resolve(evidence, 'visual-results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify({layoutChecks: results.filter(r => r.view).length, engines: ['chromium', 'webkit'], interactions: 'passed'}));
