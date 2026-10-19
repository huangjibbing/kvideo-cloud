import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const base = process.env.BASE_URL ?? 'http://127.0.0.1:8787';
const out = 'screenshots';
await mkdir(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--lang=zh-CN', '--font-render-hinting=none'],
});

const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(`PAGE: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`CONSOLE: ${message.text()}`);
});

await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
await page.goto(base, { waitUntil: 'networkidle2', timeout: 45000 });
await page.screenshot({ path: `${out}/home.png`, fullPage: false });

await page.goto(`${base}/browse`, { waitUntil: 'networkidle2' });
await page.screenshot({ path: `${out}/browse.png`, fullPage: false });

await page.goto(`${base}/title/liquid-lab`, { waitUntil: 'networkidle2' });
await page.screenshot({ path: `${out}/title.png`, fullPage: false });

await page.goto(`${base}/membership`, { waitUntil: 'networkidle2' });
await page.screenshot({ path: `${out}/membership.png`, fullPage: false });

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(base, { waitUntil: 'networkidle2' });
await page.screenshot({ path: `${out}/home-mobile.png`, fullPage: false });

console.log(JSON.stringify({ errors, title: await page.title() }, null, 2));
await browser.close();
