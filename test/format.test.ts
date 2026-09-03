import { describe, it, expect } from "vitest";
import { pickCanvasFormat } from "../src/format";

describe("pickCanvasFormat", () => {
  it("accepts the platform preference as is", () => {
    expect(pickCanvasFormat("bgra8unorm")).toBe("bgra8unorm");
    expect(pickCanvasFormat("rgba8unorm")).toBe("rgba8unorm");
  });

  it("falls back to the safe default on a format it does not know", () => {
    expect(pickCanvasFormat("rgba16float")).toBe("rgba8unorm");
    expect(pickCanvasFormat("")).toBe("rgba8unorm");
  });
});
