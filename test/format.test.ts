import { describe, it, expect } from "vitest";
import { pickCanvasFormat } from "../src/format";

describe("pickCanvasFormat", () => {
  it("platformun tercihini olduğu gibi kabul eder", () => {
    expect(pickCanvasFormat("bgra8unorm")).toBe("bgra8unorm");
    expect(pickCanvasFormat("rgba8unorm")).toBe("rgba8unorm");
  });

  it("tanımadığı formatta güvenli varsayılana düşer", () => {
    expect(pickCanvasFormat("rgba16float")).toBe("rgba8unorm");
    expect(pickCanvasFormat("")).toBe("rgba8unorm");
  });
});
