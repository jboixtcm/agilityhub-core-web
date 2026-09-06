import { chromium } from "@playwright/test";
import path from "node:path";

const galleryUrl = process.env.GALLERY_URL ?? "http://127.0.0.1:4178/_gallery";
const evidenceRoot = path.resolve("roadmap", "evidence", "E0-W02");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { height: 900, width: 1280 } });

await page.goto(galleryUrl, { waitUntil: "networkidle" });
await page.screenshot({
  fullPage: true,
  path: path.join(evidenceRoot, "gallery-agilityhub.png"),
});

await page.getByRole("button", { name: "Tema Cànic" }).click();
await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
await page.screenshot({
  fullPage: true,
  path: path.join(evidenceRoot, "gallery-canic.png"),
});

await browser.close();
console.log(`Gallery screenshots saved to ${path.relative(process.cwd(), evidenceRoot)}`);
