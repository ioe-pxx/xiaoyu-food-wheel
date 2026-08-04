const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.APP_URL || "http://127.0.0.1:4173";
const outputDir = path.join(__dirname, "..", "test-results");
fs.mkdirSync(outputDir, { recursive: true });

async function assertLayout(page, name) {
  const metrics = await page.evaluate(() => {
    const wheel = document.querySelector("#wheel canvas");
    const topbar = document.querySelector(".topbar").getBoundingClientRect();
    const actions = document.querySelector(".action-bar").getBoundingClientRect();
    return {
      bodyWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
      wheelWidth: wheel ? wheel.getBoundingClientRect().width : 0,
      wheelPixels: wheel ? wheel.toDataURL().length : 0,
      overlaps: !(topbar.bottom <= actions.top || topbar.right <= actions.left)
    };
  });
  assert.equal(metrics.bodyWidth, metrics.viewportWidth, `${name}: horizontal overflow`);
  assert.ok(metrics.wheelWidth > 180, `${name}: wheel is too small or blank`);
  assert.ok(metrics.wheelPixels > 1000, `${name}: canvas has no rendered pixels`);
  assert.equal(metrics.overlaps, false, `${name}: top bar overlaps actions`);
}

async function run() {
  const executablePath = process.env.BROWSER_PATH;
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    const portrait = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await portrait.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.waitForSelector("#wheel canvas");
    await assertLayout(page, "iPhone portrait");
    assert.equal(await page.locator("#candidateCount").textContent(), "8");
    await page.screenshot({ path: path.join(outputDir, "iphone-portrait.png"), fullPage: true });

    await page.locator("#appearanceButton").click();
    await page.locator("#appearanceName").fill("小语食堂");
    await page.locator("#backgroundFile").setInputFiles({
      name: "background.png",
      mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL8yAAAAABJRU5ErkJggg==", "base64")
    });
    await page.waitForFunction(() => document.body.classList.contains("has-custom-background"));
    await page.locator(".save-appearance-button").click();
    assert.equal(await page.locator("#workspaceName").textContent(), "小语食堂");
    assert.equal(await page.title(), "小语食堂");
    await page.locator("#closeAppearanceButton").click();
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.locator("#workspaceName").textContent(), "小语食堂");
    assert.equal(await page.title(), "小语食堂");
    assert.equal(await page.locator("body").evaluate((body) => body.classList.contains("has-custom-background")), true);

    await page.locator("#appearanceButton").click();
    await page.locator("#resetBackgroundButton").click();
    await page.locator(".save-appearance-button").click();
    assert.equal(await page.locator("body").evaluate((body) => body.classList.contains("has-custom-background")), false);
    await page.locator("#closeAppearanceButton").click();

    await page.locator("#candidateButton").click();
    await page.locator("#entryInput").fill("小笼包");
    await page.locator("#addButton").click();
    assert.equal(await page.locator("#candidateCount").textContent(), "9");
    await page.locator("#entryInput").fill(" 小笼包 ");
    await page.locator("#addButton").click();
    await page.waitForFunction(() => document.querySelector("#formMessage").textContent.includes("已经有了"));
    await page.locator("button[aria-label='删除小笼包']").click();
    assert.equal(await page.locator("#candidateCount").textContent(), "8");
    await page.locator("#undoButton").click();
    assert.equal(await page.locator("#candidateCount").textContent(), "9");
    await page.locator("#closeManageButton").click();
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.locator("#candidateCount").textContent(), "9");

    await page.locator("#spinButton").click();
    await page.locator("#resultDialog[open]").waitFor({ timeout: 7000 });
    const result = await page.locator("#resultTitle").textContent();
    assert.ok(result && result.trim().length > 0, "spin result is empty");
    await page.screenshot({ path: path.join(outputDir, "iphone-result.png"), fullPage: true });

    await page.locator("#closeResultButton").click();
    await page.waitForFunction(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return Boolean(registration && registration.active);
    });
    await portrait.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#wheel canvas");
    assert.equal(await page.locator("#candidateCount").textContent(), "9");
    assert.deepEqual(errors, []);
    await portrait.close();

    for (const [name, viewport, file] of [
      ["iPhone landscape", { width: 874, height: 402 }, "iphone-landscape.png"],
      ["desktop", { width: 1280, height: 800 }, "desktop.png"]
    ]) {
      const context = await browser.newContext({ viewport });
      const candidatePage = await context.newPage();
      await candidatePage.goto(baseUrl, { waitUntil: "networkidle" });
      await candidatePage.waitForSelector("#wheel canvas");
      await assertLayout(candidatePage, name);
      await candidatePage.screenshot({ path: path.join(outputDir, file), fullPage: true });
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

run().then(() => console.log("E2E checks passed")).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
