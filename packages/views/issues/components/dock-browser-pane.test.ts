import { describe, expect, it } from "vitest";
import { browserTabTitle, mapToFramePoint } from "./dock-browser-pane";

describe("mapToFramePoint", () => {
  it("maps 1:1 when the frame fills the host", () => {
    const point = mapToFramePoint(
      { x: 100, y: 50 },
      { width: 800, height: 600 },
      { width: 800, height: 600 },
    );
    expect(point).toEqual({ x: 100, y: 50, scale: 1 });
  });

  it("scales into device space when the frame is letterboxed (object-contain)", () => {
    // 1600x1200 frame shown in an 800x700 host: scale 0.5, vertical offset 50.
    const point = mapToFramePoint(
      { x: 400, y: 350 },
      { width: 800, height: 700 },
      { width: 1600, height: 1200 },
    );
    expect(point).toEqual({ x: 800, y: 600, scale: 0.5 });
  });

  it("rejects points on the letterbox padding outside the page", () => {
    const point = mapToFramePoint(
      { x: 400, y: 10 },
      { width: 800, height: 700 },
      { width: 1600, height: 1200 },
    );
    expect(point).toBeNull();
  });

  it("passes through untouched before the first frame arrives", () => {
    const point = mapToFramePoint(
      { x: 12.4, y: 7.6 },
      { width: 800, height: 600 },
      null,
    );
    expect(point).toEqual({ x: 12, y: 8, scale: 1 });
  });
});

describe("browserTabTitle", () => {
  it("keeps the port for local dev servers", () => {
    expect(browserTabTitle("http://localhost:3000/path")).toBe("localhost:3000");
  });

  it("falls back to the raw string for non-URLs", () => {
    expect(browserTabTitle("not a url")).toBe("not a url");
  });
});
