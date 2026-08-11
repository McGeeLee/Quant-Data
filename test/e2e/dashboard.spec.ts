import { expect, test } from "@playwright/test";
import { marketFixture, sourcesFixture } from "../fixtures";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/sources**", (route) => route.fulfill({ json: { sources: sourcesFixture } }));
  await page.route("**/api/v1/market-data**", (route) => route.fulfill({ json: marketFixture }));
});

test("English and Chinese dashboard flow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Public market data, shaped for people and models." })).toBeVisible();
  await page.getByRole("button", { name: "Fetch market data" }).click();
  await expect(page.getByText("AAPL", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Switch language" }).click();
  await expect(page.getByRole("heading", { name: "为用户与大模型而设计的公开行情数据。" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
});

test("localized documentation route", async ({ page }) => {
  await page.goto("/docs/zh-CN");
  await expect(page.getByRole("heading", { name: "Quant Data 文档" })).toBeVisible();
  await expect(page.getByText("get_market_data", { exact: true })).toBeVisible();
});

test("ultra-wide layout keeps major content on one visual baseline", async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto("/");

  const heroHeading = await page.locator(".hero h1").boundingBox();
  const workspace = await page.locator(".workspace").boundingBox();
  const developerSection = await page.locator(".developer-section").boundingBox();

  expect(heroHeading).not.toBeNull();
  expect(workspace).not.toBeNull();
  expect(developerSection).not.toBeNull();
  expect(Math.abs(heroHeading!.x - workspace!.x)).toBeLessThan(40);
  expect(Math.abs(developerSection!.x - workspace!.x)).toBeLessThan(2);
  expect(Math.abs(developerSection!.width - workspace!.width)).toBeLessThan(2);
});
