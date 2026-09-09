import type { Claim } from "./types.js";

/**
 * 小数第 n 位で丸める。
 * `toFixed` を使うのは、10のべき乗を掛けて割る書き方だと
 * 浮動小数点の誤差で 1800 が 1799.9999999999998 になることがあるため。
 */
export function roundToDecimals(value: number, decimals: number): number {
  const safe = Math.min(Math.max(decimals, 0), 20);
  return Number(value.toFixed(safe));
}

/**
 * 有効桁数で丸める。概数（「約1,800」）の照合に使う。
 * `toPrecision` は指数表記を返すことがあるが、Number() を通せば数値に戻る。
 */
export function roundToSignificant(value: number, digits: number): number {
  if (value === 0) return 0;
  const safe = Math.min(Math.max(digits, 1), 21);
  return Number(value.toPrecision(safe));
}

/**
 * 候補の値が、その主張として書かれうるかを判定する。
 *
 * 「一致するか」ではなく「その桁数で書いたら同じ表記になるか」を見ている。
 * 91.2817... は「91.3%」とも「91%」とも書けるが、「91.9%」とは書けない。
 */
export function matchesClaim(claim: Claim, candidate: number): boolean {
  if (!Number.isFinite(candidate)) return false;

  const rounded = claim.approximate
    ? roundToSignificant(candidate, claim.significantDigits)
    : roundToDecimals(candidate, claim.decimals);

  // 丸めたあとの比較なので、残る誤差は表現誤差だけ。相対誤差で吸収する。
  const tolerance = 1e-9 * Math.max(1, Math.abs(claim.value));
  return Math.abs(rounded - claim.value) <= tolerance;
}
