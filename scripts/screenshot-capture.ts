import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:5173/");
  await page.waitForTimeout(500);
  await page.screenshot({ path: "/tmp/quorummind-initial.png", fullPage: true });
  console.log("Initial screenshot saved");

  await page.click('button:has-text("Run decision room")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "/tmp/quorummind-results.png", fullPage: true });
  console.log("Results screenshot saved");

  await browser.close();
}
main();
