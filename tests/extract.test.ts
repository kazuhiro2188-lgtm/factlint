import { describe, expect, it } from "vitest";
import { extractClaims } from "../src/extract.js";

const values = (text: string): number[] => extractClaims(text).map((c) => c.value);

describe("extractClaims — 数値の取り出し", () => {
  it("桁区切りのカンマを外して読む", () => {
    expect(values("資産は 152,800 でした")).toEqual([152800]);
  });

  it("通貨記号つきの数値を読み、単位を currency と判定する", () => {
    const [claim] = extractClaims("資産は $152,800 でした");
    expect(claim?.value).toBe(152800);
    expect(claim?.unit).toBe("currency");
  });

  it("パーセントを読み、小数桁数を保持する", () => {
    const [claim] = extractClaims("充足率は 91.3% です");
    expect(claim?.value).toBe(91.3);
    expect(claim?.unit).toBe("percent");
    expect(claim?.decimals).toBe(1);
  });

  it("全角パーセントも同じく読む", () => {
    const [claim] = extractClaims("前月比 12％ の改善");
    expect(claim?.value).toBe(12);
    expect(claim?.unit).toBe("percent");
  });

  it("負の数を読む", () => {
    expect(values("差分は -8.87% でした")).toEqual([-8.87]);
  });

  it("万・億の単位を数値に展開する", () => {
    expect(values("売上は 24万 円")).toEqual([240000]);
    expect(values("時価総額 1.5億 円")).toEqual([150000000]);
  });

  it("複数の数値を出現順に返す", () => {
    expect(values("資産 152,800 / 負債 167,400")).toEqual([152800, 167400]);
  });
});

describe("extractClaims — 概数の判定", () => {
  it("『約』がついた数値を概数として扱う", () => {
    const [claim] = extractClaims("約1,800件");
    expect(claim?.approximate).toBe(true);
    expect(claim?.value).toBe(1800);
  });

  it("概数の有効桁数は末尾のゼロを除いて数える", () => {
    // 「約1,800」は上位2桁までが有意。1833 を丸めれば 1800 になる
    const [claim] = extractClaims("約1,800件");
    expect(claim?.significantDigits).toBe(2);
  });

  it("小数を含む場合は末尾のゼロも有意として数える", () => {
    const [claim] = extractClaims("約91.30%");
    expect(claim?.significantDigits).toBe(4);
  });

  it("英語の about / approximately も概数として扱う", () => {
    expect(extractClaims("about 1,800 items")[0]?.approximate).toBe(true);
    expect(extractClaims("approximately 250 users")[0]?.approximate).toBe(true);
  });

  it("修飾のない数値は概数ではない", () => {
    expect(extractClaims("1,800件")[0]?.approximate).toBe(false);
  });
});

describe("extractClaims — 既定の除外", () => {
  it("西暦を数値として扱わない", () => {
    expect(values("2026年の実績")).toEqual([]);
    expect(values("2026 年の実績")).toEqual([]);
  });

  it("日付表記を数値として扱わない", () => {
    expect(values("2026-09-08 に確認した")).toEqual([]);
    expect(values("2026/09/08 に確認した")).toEqual([]);
    expect(values("2026年9月8日に確認した")).toEqual([]);
    expect(values("9月8日に確認した")).toEqual([]);
  });

  it("バージョン番号を数値として扱わない", () => {
    expect(values("v1.2.3 をリリース")).toEqual([]);
    expect(values("バージョン 2.14.0 で修正")).toEqual([]);
  });

  it("箇条書きの番号を数値として扱わない", () => {
    expect(values("1. 最初の項目\n2. 次の項目")).toEqual([]);
  });

  it("除外を無効にすると西暦も数値として拾う", () => {
    expect(extractClaims("2026年の実績", { ignoreYears: false }).map((c) => c.value)).toEqual([2026]);
  });

  it("単位がつけば4桁でも数値として拾う", () => {
    expect(values("2026 件の申込")).toEqual([2026]);
    expect(values("$2026 の売上")).toEqual([2026]);
  });
});

describe("extractClaims — 位置情報", () => {
  it("行番号と桁番号を1始まりで返す", () => {
    const claims = extractClaims("最初の行には数値なし\n資産は 100 円");
    expect(claims).toHaveLength(1);
    expect(claims[0]?.line).toBe(2);
    expect(claims[0]?.column).toBe(5);
  });

  it("元の表記を raw として保持する", () => {
    expect(extractClaims("資産は $152,800 でした")[0]?.raw).toBe("$152,800");
  });
});
