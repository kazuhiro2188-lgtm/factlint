import { describe, expect, it } from "vitest";
import { collectSourceValues } from "../src/source.js";

describe("collectSourceValues — ソースからの数値収集", () => {
  it("オブジェクトのキーをラベルとして持つ", () => {
    const values = collectSourceValues({ assets: 152800, liabilities: 167400 });
    expect(values.map((v) => v.value)).toEqual([152800, 167400]);
    expect(values.map((v) => v.label)).toEqual(["assets", "liabilities"]);
  });

  it("入れ子のパスを組み立てる", () => {
    const values = collectSourceValues({ portfolio: { total: 100 } });
    expect(values[0]?.path).toBe("portfolio.total");
    expect(values[0]?.label).toBe("total");
  });

  it("配列を添字つきのパスにする", () => {
    const values = collectSourceValues({ monthly: [10, 20, 30] });
    expect(values.map((v) => v.path)).toEqual(["monthly[0]", "monthly[1]", "monthly[2]"]);
  });

  it("同じ親を持つ値に同じグループを付ける", () => {
    const values = collectSourceValues({ monthly: [10, 20], other: 5 });
    expect(values[0]?.group).toBe("monthly");
    expect(values[1]?.group).toBe("monthly");
    expect(values[2]?.group).not.toBe("monthly");
  });

  it("数値そのものを渡せる", () => {
    expect(collectSourceValues(42).map((v) => v.value)).toEqual([42]);
  });

  it("素のテキストからも数値を拾う", () => {
    const values = collectSourceValues("資産 152,800 / 負債 167,400");
    expect(values.map((v) => v.value)).toEqual([152800, 167400]);
  });

  it("数値以外（文字列・真偽値・null）は無視する", () => {
    const values = collectSourceValues({ name: "Acme", active: true, missing: null, count: 3 });
    expect(values.map((v) => v.value)).toEqual([3]);
  });

  it("JSON文字列の中の数値も拾う", () => {
    const values = collectSourceValues('{"assets": 152800}');
    expect(values.map((v) => v.value)).toContain(152800);
  });

  it("非有限値（NaN / Infinity）は除外する", () => {
    expect(collectSourceValues({ a: NaN, b: Infinity, c: 1 }).map((v) => v.value)).toEqual([1]);
  });
});
