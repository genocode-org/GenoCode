import { describe, expect, it } from "vitest";
import { soundIsAac } from "./aacsound.js";

describe("soundIsAac", () => {
  it("knows a recording asked for with AAC sound", () => {
    expect(soundIsAac("video/mp4;codecs=avc1.640028,mp4a.40.2")).toBe(true);
  });

  it("knows the formats whose sound must be made AAC", () => {
    expect(soundIsAac("video/mp4;codecs=avc1.640028,opus")).toBe(false);
    expect(soundIsAac("video/mp4")).toBe(false);
  });
});
