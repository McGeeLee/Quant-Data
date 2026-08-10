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
