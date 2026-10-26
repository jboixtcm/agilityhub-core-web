import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const evidence = '/evidence/2026-10-26-functional-fixes-mobile-menu-probe';
const baseUrl = 'http://127.0.0.1:4174';
async function signIn(page: Page, role: 'admin' | 'instructor') {
  await page.clock.setFixedTime(new Date('2026-08-10T17:30:00Z'));
  await page.addInitScript((scenario) => {
    localStorage.setItem('agilityhub.locale', 'ca');
    localStorage.setItem('agilityhub.mockScenario', scenario);
  }, role);
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel('Correu electrònic').fill(`${role}@example.test`);
  await page.getByRole('button', { name: 'Tinc contrasenya' }).click();
  await page.getByLabel('Contrasenya').fill('secret-password');
  await page.getByRole('button', { exact: true, name: 'ENTRA' }).click();
  await page.waitForURL(/\/(tauler|agenda)/u);
  await page.evaluate(async () => document.fonts.ready);
}

test('evidence-only: visible billing toolbar menus at375', async ({ page }) => {
  test.setTimeout(90000);
  mkdirSync(evidence, { recursive: true });
  await signIn(page, 'admin');
  await page.goto(`${baseUrl}/facturacio?mes=2026-09`);
  await expect(page.getByRole('heading', { name: 'Setembre 2026' })).toBeVisible();
  const menus = page.locator('.ah-universal-list__toolbar > details');
  await expect.poll(() => menus.count()).toBeGreaterThanOrEqual(3);
  await expect(menus.first().locator('summary')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Actius amb pagament en efectiu' })).toBeVisible();
  const cardBounds = await page.locator('.billing-simulation').evaluate((card) => {
    const rect = card.getBoundingClientRect();
    const style = getComputedStyle(card);
    return { left: rect.left, right: rect.right, width: rect.width,
      paddingLeft: style.paddingLeft, paddingRight: style.paddingRight,
      tables: [...card.querySelectorAll('.billing-members')].map((table) => ({
        text: table.textContent?.trim(),
        left: table.getBoundingClientRect().left, right: table.getBoundingClientRect().right,
        actions: [...table.querySelectorAll('a')].map((action) => ({
          name: action.getAttribute('aria-label'), left: action.getBoundingClientRect().left,
          right: action.getBoundingClientRect().right,
        })),
      })),
    };
  });
  writeFileSync(join(evidence, 'billing-cash-card-bounds.json'), JSON.stringify(cardBounds, null, 2)+'\n');
  await page.screenshot({ path: join(evidence, 'billing-cash-card-375.png'), fullPage: true });
  for (const table of cardBounds.tables) {
    expect.soft(table.right, `${table.text} table ends inside card`).toBeLessThanOrEqual(cardBounds.right);
    for (const action of table.actions) {
      expect.soft(action.right, `${action.name} ends inside card`).toBeLessThanOrEqual(cardBounds.right);
    }
  }
  const observations = [];
  for (let index = 0; index < await menus.count(); index += 1) {
    const menu = menus.nth(index);
    const summary = menu.locator('summary');
    const name = await summary.innerText();
    await summary.click();
    const panel = menu.locator('.ah-universal-list__menu-panel');
    await expect(panel).toBeVisible();
    await page.evaluate(async () => document.fonts.ready);
    const observation = await panel.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        viewport: innerWidth, documentWidth: document.documentElement.scrollWidth,
        scrollX, left: bounds.left, right: bounds.right, width: bounds.width,
        controls: [...element.querySelectorAll('button,input,select,label')].map((control) => {
          const rect = control.getBoundingClientRect();
          return { tag: control.tagName, text: control.textContent?.trim().slice(0,80),
            left: rect.left, right: rect.right, width: rect.width };
        }),
      };
    });
    observations.push({ name, ...observation });
    await page.screenshot({ path: join(evidence, `billing-menu-${index}-375.png`), fullPage: true });
    writeFileSync(join(evidence, 'billing-open-menu-bounds.json'), JSON.stringify(observations, null, 2)+'\n');
    expect.soft(observation.left, `${name} starts inside viewport`).toBeGreaterThanOrEqual(0);
    expect.soft(observation.right, `${name} ends inside viewport`).toBeLessThanOrEqual(375);
    expect.soft(observation.documentWidth, `${name} page width`).toBe(375);
    await summary.click();
    await expect(panel).toBeHidden();
  }
});

test('evidence-only: instructor open-navigation icon after assets settle', async ({ page }) => {
  await signIn(page, 'instructor');
  const toggle = page.getByRole('button', { name: 'Navegació d’administració' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('navigation', { name: 'Navegació d’administració' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => document.fonts.ready);
  const icon = await toggle.evaluate((element) => ({
    markup: element.outerHTML,
    svgs: [...element.querySelectorAll('svg')].map((svg) => {
      const bounds = svg.getBoundingClientRect();
      const box = svg.getBBox();
      return { left: bounds.left, right: bounds.right, width: bounds.width, height: bounds.height,
        box: { x: box.x, y: box.y, width: box.width, height: box.height } };
    }),
  }));
  writeFileSync(join(evidence, 'instructor-open-navigation-icon.json'), JSON.stringify(icon,null,2)+'\n');
  await page.screenshot({ path: join(evidence, 'instructor-open-navigation-375.png') });
  await toggle.screenshot({ path: join(evidence, 'instructor-close-icon-375.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('navigation', { name: 'Navegació d’administració' })).toBeHidden();
  await expect(toggle).toBeFocused();
});
