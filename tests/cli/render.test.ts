import { check } from "../../src/index.js";
import { describe, expect, it } from "vitest";
import { renderGithub, renderHuman, renderJson } from "../../src/cli/render.js";

const report = check({
  source: { assets: 152800, liabilities: 167400 },
  output: "資産は $152,800、充足率は 91.3% です。前月比 12% 改善しました。",
});

describe("renderHuman", () => {
  it("根拠なしの行に印を出す", () => {
    expect(renderHuman(report, false)).toContain("✗ ungrounded");
  });

  it("根拠ありの行に計算式を出す", () => {
    expect(renderHuman(report, false)).toContain("÷");
  });

  it("最も近い候補を併記する", () => {
    expect(renderHuman(report, false)).toContain("最も近い候補");
  });

  it("集計行を出す", () => {
    const text = renderHuman(report, false);
    expect(text).toContain("根拠あり");
    expect(text).toContain("根拠なし 1件");
  });

  it("色を無効にすると制御文字を含まない", () => {
    expect(renderHuman(report, false)).not.toContain("\u001B[");
  });

  it("色を有効にすると制御文字を含む", () => {
    expect(renderHuman(report, true)).toContain("\u001B[");
  });

  it("数値が無い場合はその旨を出す", () => {
    const empty = check({ source: { a: 1 }, output: "順調です。" });
    expect(renderHuman(empty, false)).toContain("検証対象の数値はありませんでした");
  });
});

describe("renderJson", () => {
  it("JSONとして解釈できる", () => {
    expect(() => JSON.parse(renderJson(report)) as unknown).not.toThrow();
  });

  it("統計と各主張を含む", () => {
    const parsed = JSON.parse(renderJson(report)) as {
      stats: { ungrounded: number };
      results: Array<{ raw: string; status: string }>;
    };
    expect(parsed.stats.ungrounded).toBe(1);
    expect(parsed.results.some((r) => r.status === "ungrounded")).toBe(true);
  });

  it("根拠が無い項目は null で埋める（キーを落とさない）", () => {
    const parsed = JSON.parse(renderJson(report)) as { results: Array<{ evidence: unknown }> };
    expect(parsed.results.some((r) => r.evidence === null)).toBe(true);
  });
});

describe("renderGithub", () => {
  it("根拠なしだけをアノテーションにする", () => {
    const text = renderGithub(report, "report.md");
    expect(text.split("\n")).toHaveLength(1);
    expect(text).toContain("::error file=report.md");
  });

  it("行と桁を含む", () => {
    expect(renderGithub(report, "report.md")).toMatch(/line=\d+,col=\d+/);
  });

  it("根拠なしが無ければ空文字を返す", () => {
    const clean = check({ source: { a: 100 }, output: "値は 100 です。" });
    expect(renderGithub(clean, "report.md")).toBe("");
  });
});
