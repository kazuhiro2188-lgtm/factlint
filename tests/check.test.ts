import { describe, expect, it } from "vitest";
import { check } from "../src/check.js";
import type { ClaimStatus } from "../src/types.js";

const statuses = (source: unknown, output: string): ClaimStatus[] =>
  check({ source, output }).results.map((r) => r.status);

const statusOf = (source: unknown, output: string, raw: string): ClaimStatus | undefined =>
  check({ source, output }).results.find((r) => r.claim.raw.includes(raw))?.status;

describe("check — ソースに存在する値", () => {
  it("そのまま書かれた数値を exact と判定する", () => {
    expect(statuses({ assets: 152800 }, "資産は 152,800 です")).toEqual(["exact"]);
  });

  it("通貨記号つきでも同じ値として照合する", () => {
    expect(statuses({ assets: 152800 }, "資産は $152,800 です")).toEqual(["exact"]);
  });

  it("根拠にソースのラベルを含める", () => {
    const [result] = check({ source: { assets: 152800 }, output: "資産は 152,800 です" }).results;
    expect(result?.evidence?.kind).toBe("exact");
    expect(result?.evidence?.expression).toContain("assets");
  });
});

describe("check — 派生値", () => {
  it("合計を導ける", () => {
    expect(statusOf({ monthly: [1200, 3400, 800] }, "合計 5,400 件でした", "5,400")).toBe("derived");
  });

  it("平均を導ける", () => {
    expect(statusOf({ monthly: [1200, 3400, 800] }, "平均 1,800 件でした", "1,800")).toBe("derived");
  });

  it("最大値はソースに実在するので exact になる", () => {
    expect(statusOf({ monthly: [1200, 3400, 800] }, "最大は 3,400 件でした", "3,400")).toBe("exact");
  });

  it("比率（÷ × 100）を導ける", () => {
    expect(statusOf({ assets: 152800, liabilities: 167400 }, "充足率は 91.3% です", "91.3")).toBe("derived");
  });

  it("差分を導ける", () => {
    expect(statusOf({ assets: 152800, liabilities: 167400 }, "差額は 14,600 です", "14,600")).toBe("derived");
  });

  it("増減率を導ける", () => {
    // (167400 - 152800) ÷ 152800 × 100 = 9.5549...
    expect(statusOf({ before: 152800, after: 167400 }, "9.6% の増加", "9.6")).toBe("derived");
  });

  it("根拠に計算式を含める", () => {
    const result = check({
      source: { assets: 152800, liabilities: 167400 },
      output: "充足率は 91.3% です",
    }).results[0];
    expect(result?.evidence?.expression).toContain("÷");
    expect(result?.evidence?.expression).toContain("100");
  });
});

describe("check — 丸めの許容", () => {
  it("書かれた小数桁数に合わせて丸めて照合する", () => {
    // 152800 ÷ 167400 × 100 = 91.2817...
    expect(statusOf({ a: 152800, b: 167400 }, "充足率は 91.3% です", "91.3")).toBe("derived");
    expect(statusOf({ a: 152800, b: 167400 }, "充足率は 91.28% です", "91.28")).toBe("derived");
    expect(statusOf({ a: 152800, b: 167400 }, "充足率は 91% です", "91%")).toBe("derived");
  });

  it("桁数を超えて外れていれば根拠なしとする", () => {
    expect(statusOf({ a: 152800, b: 167400 }, "充足率は 91.9% です", "91.9")).toBe("ungrounded");
  });

  it("概数は有効桁数に合わせて丸めて照合する", () => {
    expect(statuses({ count: 1833 }, "約1,800件 ありました")).toEqual(["exact"]);
  });

  it("概数でも有効桁数の範囲を外れれば根拠なしとする", () => {
    expect(statuses({ count: 1833 }, "約2,500件 ありました")).toEqual(["ungrounded"]);
  });
});

describe("check — 根拠なしの検出", () => {
  it("仕様書の例：前月比の数値だけが根拠なしになる", () => {
    const report = check({
      source: { assets: 152800, liabilities: 167400 },
      output: "資産は $152,800、負債は $167,400 で、充足率は 91.3% です。前月比では 12% 改善しました。",
    });
    expect(report.results.map((r) => r.status)).toEqual(["exact", "exact", "derived", "ungrounded"]);
    expect(report.stats.ungrounded).toBe(1);
  });

  it("最も近い候補を差分つきで示す", () => {
    const report = check({
      source: { assets: 152800, liabilities: 167400 },
      output: "前月比では 12% 改善しました。",
    });
    const nearest = report.results[0]?.nearest;
    expect(nearest).toBeDefined();
    expect(nearest?.delta).toBeGreaterThan(0);
    expect(nearest?.expression.length).toBeGreaterThan(0);
  });

  it("ソースが空なら候補も存在せず、最も近い候補は付かない", () => {
    const report = check({ source: {}, output: "売上は 500 万円でした" });
    expect(report.results[0]?.status).toBe("ungrounded");
    expect(report.results[0]?.nearest).toBeUndefined();
  });
});

describe("check — 集計", () => {
  it("数値が無い文章は根拠ありの割合を 1 とする", () => {
    const report = check({ source: { a: 1 }, output: "順調に推移しています。" });
    expect(report.stats.total).toBe(0);
    expect(report.stats.groundedRatio).toBe(1);
  });

  it("種別ごとの件数を返す", () => {
    const report = check({
      source: { a: 100, b: 50 },
      output: "a は 100、合計は 150、根拠のない 77 も含みます。",
    });
    expect(report.stats.exact).toBe(1);
    expect(report.stats.derived).toBe(1);
    expect(report.stats.ungrounded).toBe(1);
    expect(report.stats.total).toBe(3);
    expect(report.stats.groundedRatio).toBeCloseTo(2 / 3, 5);
  });
});

describe("check — 打ち切りの申告", () => {
  it("ソース値が上限以下なら打ち切らない", () => {
    const report = check({ source: { a: 1, b: 2 }, output: "3 です" });
    expect(report.truncated).toBe(false);
  });

  it("上限を超えたら2値演算を打ち切り、その旨を申告する", () => {
    const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, i + 1]));
    const report = check({ source: many, output: "1 です", options: { maxPairwiseValues: 10 } });
    expect(report.truncated).toBe(true);
  });

  it("打ち切っても集約による判定は続ける", () => {
    const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, i + 1]));
    // 1..30 の合計は 465
    const report = check({ source: many, output: "合計 465 です", options: { maxPairwiseValues: 10 } });
    expect(report.results[0]?.status).toBe("derived");
  });
});

describe("check — 無関係な2値の掛け合わせを根拠にしない（実データで見つかった回帰）", () => {
  // 初回のドッグフーディングで、あるポジションの元本を全体の負債で割った
  // 意味のない計算 (20100 ÷ 167400 × 100 = 12.01) が、根拠のない「12%」を通してしまった。
  const source = {
    assets: 152800,
    liabilities: 167400,
    positions: [
      { venue: "alpha", principal: 90000, collected: 198 },
      { venue: "beta", principal: 20100, collected: 2133 },
    ],
  };

  it("無関係な項目どうしの比率では根拠ありにしない", () => {
    const report = check({ source, output: "前月比では 12% 改善しました。" });
    expect(report.results[0]?.status).toBe("ungrounded");
  });

  it("同じまとまりの中の比率は根拠ありとする", () => {
    // beta の 2133 ÷ 20100 × 100 = 10.61
    const report = check({ source, output: "元本あたりの回収効率は 10.61% です。" });
    expect(report.results[0]?.status).toBe("derived");
    expect(report.results[0]?.evidence?.expression).toContain("÷");
  });

  it("同じ項目名どうしの合計は根拠ありとする", () => {
    // principal 90000 + 20100 = 110100
    const report = check({ source, output: "投下元本の合計は 110,100 です。" });
    expect(report.results[0]?.status).toBe("derived");
  });

  it("配列の要素数を素直な根拠として示す", () => {
    const report = check({ source, output: "運用中のポジションは 2 件です。" });
    expect(report.results[0]?.status).toBe("derived");
    expect(report.results[0]?.evidence?.expression).toContain("要素数");
  });
});

describe("check — 倍率をパーセントの根拠にしない（結合テストで見つかった回帰）", () => {
  // 別リポジトリ（report-agent）で4つの部品を組み合わせたときに発覚した。
  // 「送金額 ÷ 支出合計 = 3.18」という倍率が、根拠のない「3.2%」を通していた。
  // 割り算の商は倍率であって百分率ではない。
  const source = { 送金額: 933050, 支出合計: 293400 };

  it("倍率は パーセントの主張の根拠にならない", () => {
    const report = check({ source, output: "前年同月比では 3.2% の増加です。" });
    expect(report.results[0]?.status).toBe("ungrounded");
  });

  it("×100 した比率は パーセントの根拠になる", () => {
    // 293400 ÷ 933050 × 100 = 31.44...
    const report = check({ source, output: "支出は送金額の 31.4% にあたります。" });
    expect(report.results[0]?.status).toBe("derived");
  });

  it("単位のない主張には、倍率をこれまでどおり使える", () => {
    const report = check({ source, output: "送金額は支出の 3.18 倍です。" });
    expect(report.results[0]?.status).toBe("derived");
  });
});
