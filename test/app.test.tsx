// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { marketFixture, sourcesFixture } from "./fixtures";

vi.mock("../src/components/MarketCharts", () => ({ MarketCharts: () => <div data-testid="charts">charts</div> }));

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  window.history.replaceState({}, "", "/");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockApi(marketResponse: Response = Response.json(marketFixture)) {
  vi.stubGlobal("fetch", vi.fn<typeof fetch>((input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/sources")) return Promise.resolve(Response.json({ sources: sourcesFixture }));
    return Promise.resolve(marketResponse.clone());
  }));
}

describe("bilingual dashboard", () => {
  it("shows source status and persists a language switch", async () => {
    mockApi();
    render(<App />);
    await screen.findByText("Yahoo Finance Chart");
    expect(screen.getByText("Public market data, shaped for people and models.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Switch language" }));
    expect(screen.getByText("为用户与大模型而设计的公开行情数据。")).toBeTruthy();
    expect(localStorage.getItem("quant-data-locale")).toBe("zh-CN");
  });

  it("renders metrics and all chart states after loading", async () => {
    mockApi();
    render(<App />);
    await screen.findByText("Yahoo Finance Chart");
    fireEvent.click(screen.getByRole("button", { name: /Fetch market data/ }));
    await waitFor(() => expect(screen.getByText("104")).toBeTruthy());
    expect(screen.getByTestId("charts")).toBeTruthy();
    expect(screen.getAllByText("Secret not configured")).toHaveLength(2);
  });

  it("announces a stable API error", async () => {
    mockApi(Response.json({ error: { code: "NOT_FOUND", message: "No market data was found.", requestId: "test-ray" } }, { status: 404 }));
    render(<App />);
    await screen.findByText("Yahoo Finance Chart");
    fireEvent.click(screen.getByRole("button", { name: /Fetch market data/ }));
    await screen.findByRole("alert");
    expect(screen.getByText(/No market data was found/)).toBeTruthy();
  });
});
