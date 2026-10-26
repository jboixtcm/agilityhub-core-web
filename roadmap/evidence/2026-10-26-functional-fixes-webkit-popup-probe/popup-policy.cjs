// Evidence-only calibration. This is not a Safari or application acceptance test.
const http = require('node:http');
const fs = require('node:fs');
const { webkit } = require('/src/node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core');

const directory = '/evidence/2026-10-26-functional-fixes-webkit-popup-probe';
const server = http.createServer((request, response) => {
  response.setHeader('Content-Type', 'text/html');
  if (request.url.startsWith('/opened')) {
    response.end('<!doctype html><title>Opened popup</title><h1>Opened popup</h1>');
    return;
  }
  response.end(`<!doctype html><title>Popup policy control</title>
    <h1>WebKit automation popup policy control</h1><button id="open">Open</button>
    <script>
      const query = new URLSearchParams(location.search);
      const delay = Number(query.get('delay'));
      window.observation = {};
      function launch() {
        window.observation.beforeOpen = {active: navigator.userActivation?.isActive, hasBeenActive: navigator.userActivation?.hasBeenActive};
        window.open('/opened', '_blank', 'noopener,noreferrer');
        window.observation.finished = true;
      }
      document.querySelector('#open').onclick = () => {
        window.observation.atClick = {active: navigator.userActivation?.isActive, hasBeenActive: navigator.userActivation?.hasBeenActive};
        if (delay === 0) launch(); else setTimeout(launch, delay);
      };
      if(query.get('auto') === '1') setTimeout(launch, 100);
    </script>`);
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await webkit.launch({ headless: true });
    const cases = [];
    for (const item of [{name:'unactivated', auto:true, delay:0}, {name:'immediate-click',delay:0}, {name:'delayed-1500ms',delay:1500}, {name:'delayed-6000ms',delay:6000}]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      let opened = 0;
      page.on('popup', () => { opened += 1; });
      await page.goto(`http://127.0.0.1:${server.address().port}/?delay=${item.delay}&auto=${item.auto ? 1 : 0}`);
      if (!item.auto) await page.locator('#open').click();
      // Do not poll through page.evaluate/waitForFunction: WebKit's protocol evaluation
      // requests emulateUserGesture, which could contaminate this calibration.
      await new Promise(resolve => setTimeout(resolve, (item.auto ? 100 : item.delay) + 600));
      cases.push({ ...item, opened, observation: await page.evaluate(() => window.observation), userAgent: await page.evaluate(() => navigator.userAgent) });
      await context.close();
    }
    const result = { environment: 'Playwright 1.63.0 WebKit, official Linux noble Docker image, headless', browserVersion: browser.version(), scope: 'Automation popup policy calibration only; no app flow, macOS Safari, provider or deployment tested', cases };
    fs.writeFileSync(`${directory}/popup-policy-result.json`, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
    if(cases.find(item => item.name === 'immediate-click').opened !== 1) throw new Error('Immediate click positive control failed');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
