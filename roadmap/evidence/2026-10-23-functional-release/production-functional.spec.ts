import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const evidence = process.env.CORE_EVIDENCE_DIRECTORY!;
const password = process.env.E1_CORE_PASSWORD!;
mkdirSync(evidence, { recursive: true });

async function login(page: Page, host: string, email: string) {
  await page.goto(`https://${host}/${host.startsWith('id.') ? 'login' : 'entrar'}`);
  await page.getByLabel('Correu electrònic').fill(email);
  const reveal = page.getByRole('button', { name: 'Tinc contrasenya' });
  if (await reveal.isVisible()) await reveal.click();
  await page.getByLabel('Contrasenya', { exact: true }).fill(password);
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/oauth2/token' && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'ENTRA', exact: true }).click();
  expect((await response).status()).toBe(200);
  await page.waitForURL(/\/(?:inici|perfil-acces|tauler|account)$/);
  if (new URL(page.url()).pathname === '/perfil-acces') {
    await page.locator('button.profile-choice__card').filter({ hasText: /Com a alumn/ }).click();
    await page.waitForURL('**/inici');
  }
}
async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(evidence, name + '.png'), fullPage: true });
}
async function spa(page: Page, path: string) {
  await page.evaluate(path => { history.pushState(null, '', path); dispatchEvent(new PopStateEvent('popstate')); }, path);
}

test('compiled three-SPA HTTPS: independent host-only sessions, deep reloads and ID logout isolation', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => localStorage.setItem('agilityhub.locale', 'ca'));
  const member = await context.newPage();
  await member.setViewportSize({ width: 375, height: 812 });
  const admin = await context.newPage();
  const id = await context.newPage();
  let memberAuthorization = '';
  member.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/v1/') && request.headers().authorization)
      memberAuthorization = request.headers().authorization;
  });
  const uncaught: string[] = [];
  for (const page of [member, admin, id]) page.on('pageerror', error => uncaught.push(error.message));
  await login(member, 'app.example.test', 'member@example.test');
  await expect.poll(() => memberAuthorization.startsWith('Bearer ')).toBe(true);
  const denied = await member.evaluate(async authorization => {
    const response = await fetch('/api/v1/parameters', { headers: { Authorization: authorization } });
    const body = await response.json();
    return { status: response.status, code: body.code, hasParameterBlocks: 'blocks' in body };
  }, memberAuthorization);
  expect(denied).toMatchObject({ status: 403, hasParameterBlocks: false });
  await login(admin, 'admin.example.test', 'admin@example.test');
  await login(id, 'id.example.test', 'admin@example.test');
  const cookies = (await context.cookies()).filter(cookie => cookie.name === 'ah_refresh');
  expect(cookies.map(cookie => cookie.domain).sort()).toEqual(['admin.example.test', 'app.example.test', 'id.example.test']);
  expect(new Set(cookies.map(cookie => cookie.value)).size).toBe(3);
  for (const cookie of cookies) {
    expect(cookie).toMatchObject({ path: '/oauth2/token', secure: true, httpOnly: true, sameSite: 'Strict' });
  }
  const loadedBundles: { host: string; path: string; scripts: string[] }[] = [];
  for (const [page, path, name] of [[member, '/entrenaments', 'compiled-member-training-375'],
    [admin, '/parametres', 'compiled-admin-parameters-1280'], [id, '/products', 'compiled-id-products-1280']] as const) {
    await page.goto(new URL(path, page.url()).href);
    await page.reload();
    await expect(page).toHaveURL(new RegExp(path + '$'));
    await expect(page.getByRole('heading', { name: path === '/entrenaments' ? 'Entrenaments' : path === '/parametres' ? 'Paràmetres' : 'Els teus productes', exact: true })).toBeVisible();
    expect(await page.evaluate(() => isSecureContext)).toBe(true);
    const scripts = await page.locator('script[src]').evaluateAll(nodes => nodes.map(node => (node as HTMLScriptElement).src));
    expect(scripts.some(src => src.includes('/assets/') && src.endsWith('.js'))).toBe(true);
    expect(scripts.some(src => /@vite|\/src\//.test(src))).toBe(false);
    loadedBundles.push({ host: new URL(page.url()).host, path, scripts });
    await shot(page, name);
  }
  const productLinks = await id.locator('main a[href]').evaluateAll(nodes => nodes.map(node => ({
    text: node.textContent?.trim(), href: (node as HTMLAnchorElement).href,
    target: (node as HTMLAnchorElement).target,
  })));
  await member.goto('https://app.example.test/perfil');
  const profileLearn = member.locator('a[href="https://learn.agilitydoghub.com"]');
  await expect(profileLearn).toBeVisible();
  const profileLink = { text: await profileLearn.textContent(), href: await profileLearn.getAttribute('href'),
    target: await profileLearn.getAttribute('target') };
  writeFileSync(join(evidence, 'isolated-demo-external-links.json'), JSON.stringify({
    productLinks, profileLink, externallyNavigated: false,
    scope: 'Read visible DOM hrefs only; no external product navigation or authentication',
  }, null, 2) + '\n');
  await shot(member, 'compiled-member-profile-learn-link-375');
  await member.goto('https://app.example.test/entrenaments');
  const revoke = id.waitForResponse(r => new URL(r.url()).pathname === '/oauth2/revoke');
  await id.goto('https://id.example.test/logout');
  expect((await revoke).status()).toBe(200);
  await expect(id.getByRole('heading', { name: 'Entra a AgilityHub' })).toBeVisible();
  await member.reload(); await admin.reload();
  await expect(member.getByRole('heading', { name: 'Entrenaments', exact: true })).toBeVisible();
  await expect(admin.getByRole('heading', { name: 'Paràmetres', exact: true })).toBeVisible();
  const remaining = (await context.cookies()).filter(cookie => cookie.name === 'ah_refresh');
  expect(remaining.map(cookie => cookie.domain).sort()).toEqual(['admin.example.test', 'app.example.test']);
  writeFileSync(join(evidence, 'distinct-host-results.json'), JSON.stringify({
    cookieAttributes: cookies.map(({ value, ...attributes }) => attributes),
    remainingCookieHosts: remaining.map(cookie => cookie.domain), deniedAdminParameters: denied, loadedBundles, uncaught,
    tlsScope: 'Self-signed local certificate; only its SPKI trusted in test browser; no public CA or Caddy claim',
  }, null, 2) + '\n');
  expect(uncaught).toEqual([]);
  await shot(id, 'compiled-id-logout-1280');
  await context.close();
});

test('compiled member UI: delayed loading, offline stale copy, disabled writes and online recovery', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  await context.addInitScript(() => localStorage.setItem('agilityhub.locale', 'ca'));
  const page = await context.newPage();
  await login(page, 'app.example.test', 'member@example.test');
  await page.route('**/api/v1/**', async route => {
    if (/training/.test(new URL(route.request().url()).pathname) && route.request().method() === 'GET')
      await new Promise(resolve => setTimeout(resolve, 2500));
    await route.continue();
  });
  await spa(page, '/entrenaments');
  await expect(page.getByRole('heading', { name: 'Entrenaments', exact: true })).toBeVisible();
  await expect(page.locator('.ah-skeleton').first()).toBeVisible();
  await shot(page, 'compiled-member-training-loading-375');
  await expect(page.locator('.training-screen .ah-slot-grid, .training-closed').first()).toBeVisible();
  await page.unrouteAll({ behavior: 'wait' });
  await page.locator('button.ah-slot--free').first().click();
  await expect(page.getByRole('button', { name: /^Confirma/ })).toBeEnabled();
  await context.setOffline(true);
  await expect(page.getByText('pot no estar al dia', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Confirma/ })).toBeDisabled();
  await shot(page, 'compiled-member-training-offline-375');
  const recovered = page.waitForResponse(r => /training/.test(new URL(r.url()).pathname) && r.request().method() === 'GET');
  await context.setOffline(false);
  expect((await recovered).status()).toBe(200);
  await expect(page.getByText('pot no estar al dia', { exact: true })).toHaveCount(0);
  await shot(page, 'compiled-member-training-recovered-375');
  await context.close();
});

test('compiled cold boot: readable server-failure state and retry recover from a transient branding outage', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  await context.addInitScript(() => localStorage.setItem('agilityhub.locale', 'ca'));
  const page = await context.newPage();
  await page.route('**/api/v1/branding*', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.goto('https://app.example.test/entrar');
  await expect(page.getByRole('heading', { name: 'No disponible' })).toBeVisible();
  await expect(page.getByText('No hi ha connexió amb el servidor.')).toBeVisible();
  await shot(page, 'compiled-branding-error-375');
  await page.unroute('**/api/v1/branding*');
  await page.getByRole('button', { name: 'Torna-ho a provar' }).click();
  await expect(page.getByLabel('Correu electrònic')).toBeVisible();
  await shot(page, 'compiled-branding-recovered-375');
  await context.close();
});

test('D11 mandatory privacy processes have translated labels and no unusable disable action', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => localStorage.setItem('agilityhub.locale', 'ca'));
  const page = await context.newPage();
  await login(page, 'admin.example.test', 'admin@example.test');
  await page.goto('https://admin.example.test/parametres');
  const row = page.locator('[data-job="erasures"]');
  await expect(row).toBeVisible();
  const names = await page.locator('.jobs-card__main strong').allTextContents();
  const raw = names.filter(name => /jobs\.name\./.test(name));
  const toggle = row.getByRole('switch');
  const response = page.waitForResponse(r => r.request().method() === 'PUT' && new URL(r.url()).pathname === '/api/v1/jobs/erasures/switch');
  await toggle.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /^Desactiva$/i }).click();
  const answer = await response;
  const body = await answer.json();
  writeFileSync(join(evidence, 'd11-mandatory-process-observation.json'), JSON.stringify({
    rawLabels: raw, switchVisible: true, response: { status: answer.status(), code: body.code, details: body.details },
  }, null, 2) + '\n');
  await shot(page, 'compiled-d11-mandatory-process-rejection-1280');
  await page.screenshot({ path: join(evidence, 'compiled-d11-mandatory-process-dialog-viewport.png'), fullPage: false });
  await context.close();
  expect.soft(raw, 'All automatic-process labels must be translated').toEqual([]);
  expect.soft(answer.status(), 'The UI must not offer a non-switchable action that returns JOB_UNKNOWN').not.toBe(404);
});
