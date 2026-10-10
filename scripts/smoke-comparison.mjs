import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { copyFile, readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

// Pass an absolute Playwright module entry with GENNY_PLAYWRIGHT_MODULE when
// using a shared browser-test runtime; otherwise install Playwright locally.
const { chromium } = await import(process.env.GENNY_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.GENNY_PLAYWRIGHT_MODULE).href : 'playwright');
const root = resolve('dist');
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.geojson': 'application/json', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/gennytracks(?=\/)/, '');
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = resolve(root, '.' + pathname);
    if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }).end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
let browser;
try {
  try { browser = await chromium.launch({ headless: true }); }
  catch { browser = await chromium.launch({ channel: 'msedge', headless: true }); }
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const prefix of ['/', '/gennytracks/']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const route = prefix + '?election=2024&view=compare&compare=2019-notional-2024';
    await page.goto(base + route);
    await page.getByLabel('Area', { exact: true }).waitFor({ timeout: 15000 }).catch(async (error) => { console.log(JSON.stringify({ errors, body: await page.locator('body').innerText(), url: page.url() })); throw error; });
    await page.waitForFunction(() => document.querySelectorAll('.comparison-map-pair path.leaflet-interactive').length === 1300);
    await page.getByLabel('Area', { exact: true }).selectOption('London');
    await page.getByLabel('Winner changes only').uncheck();
    if (prefix === '/') {
      const pngPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export comparison PNG' }).click();
      const pngDownload = await pngPromise;
      const pngPath = await pngDownload.path();
      const png = await readFile(pngPath);
      assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      const pngWidth = png.readUInt32BE(16);
      const pngHeight = png.readUInt32BE(20);
      assert.equal(pngWidth, 1600);
      assert.ok(pngHeight > 500, `unexpected PNG height ${pngHeight}`);
      assert.ok(png.length > 100_000, 'comparison PNG should contain both boundary maps');
      if (process.env.GENNY_SMOKE_PNG_MATCHED_PATH) await copyFile(pngPath, resolve(process.env.GENNY_SMOKE_PNG_MATCHED_PATH));
      console.log(`PASS ${prefix}: comparison PNG ${pngWidth}×${pngHeight}, ${png.length} bytes`);
    }
    await page.getByRole('searchbox', { name: 'Search comparison seats or parties' }).fill('Hendon');
    await page.getByRole('button', { name: /Hendon/ }).waitFor();
    assert.match(page.url(), /compareArea=London/);
    assert.match(page.url(), /compareQuery=Hendon/);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export comparison', exact: true }).click();
    const download = await downloadPromise;
    const csv = await readFile(await download.path(), 'utf8');
    assert.equal(csv.trim().split('\r\n').length, 2);
    assert.match(csv, /Hendon/);
    assert.match(csv, /selected_source/);
    assert.match(csv, /"declared","notional"/);
    const shared = page.url();
    await page.reload();
    await page.getByRole('button', { name: /Hendon/ }).waitFor();
    assert.equal(page.url(), shared);
    await page.getByRole('button', { name: /Hendon/ }).click();
    await page.getByRole('heading', { name: 'Hendon', exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Compare', exact: true }).click();
    await page.getByLabel('Compare with', { exact: true }).selectOption('2001');
    await page.getByText(/no seat-by-seat changes are inferred/).waitFor({ timeout: 15000 }).catch(async (error) => { console.log(JSON.stringify({ errors, body: (await page.locator('body').innerText()).slice(0,1800), url: page.url() })); throw error; });
    await page.getByRole('button', { name: 'Export area party totals' }).waitFor({ timeout: 10000 }).catch(async (error) => { console.log(JSON.stringify({ errors, body: (await page.locator('body').innerText()).slice(-2200), url: page.url() })); throw error; });
    const crossBoundaryPngPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export comparison PNG' }).click();
    const crossBoundaryDownload = await crossBoundaryPngPromise;
    const crossBoundaryPath = await crossBoundaryDownload.path();
    const crossBoundaryPng = await readFile(crossBoundaryPath);
    assert.deepEqual([...crossBoundaryPng.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(crossBoundaryPng.readUInt32BE(16), 1600);
    assert.ok(crossBoundaryPng.readUInt32BE(20) > 500);
    if (process.env.GENNY_SMOKE_PNG_CROSS_BOUNDARY_PATH) await copyFile(crossBoundaryPath, resolve(process.env.GENNY_SMOKE_PNG_CROSS_BOUNDARY_PATH));
    assert.equal(await page.getByLabel('Winner changes only').count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel('Compare with', { exact: true }).selectOption('2019-notional-2024');
    await page.getByRole('button', { name: /Hendon/ }).waitFor();
    await page.waitForFunction(() => document.querySelectorAll('.comparison-map-pair path.leaflet-interactive').length === 1300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false, 'mobile layout must not overflow horizontally');
    if (process.env.GENNY_SMOKE_SCREENSHOTS) {
      await page.screenshot({ path: resolve(process.env.GENNY_SMOKE_SCREENSHOTS, 'comparison-mobile.png'), fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({ path: resolve(process.env.GENNY_SMOKE_SCREENSHOTS, 'comparison-desktop.png'), fullPage: true });
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${prefix}: maps, area/search filters, CSV, shared URL, seat navigation, incompatible boundaries, mobile layout`);
    await page.close();
  }
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
