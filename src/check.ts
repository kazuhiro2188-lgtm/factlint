import { findEvidence } from "./derive.js";
import { DEFAULT_EXTRACT_OPTIONS, extractClaims } from "./extract.js";
import { collectSource } from "./source.js";
import type { CheckInput, CheckOptions, ClaimResult, Report } from "./types.js";

export const DEFAULT_CHECK_OPTIONS: CheckOptions = {
  ...DEFAULT_EXTRACT_OPTIONS,
  maxPairwiseValues: 80,
};

/**
 * AI生成文の数値が、ソースから根拠を辿れるかを判定する。
 *
 * この関数はAIを呼ばない。同じ入力なら必ず同じ結果を返す（ADR-0001）。
 */
export function check(input: CheckInput): Report {
  const options: CheckOptions = { ...DEFAULT_CHECK_OPTIONS, ...input.options };

  const { values: sourceValues, arrayLengths } = collectSource(input.source);
  const claims = extractClaims(input.output, options);
  const truncated = sourceValues.length > options.maxPairwiseValues;

  const results: ClaimResult[] = claims.map((claim) => {
    const { evidence, nearest } = findEvidence(claim, {
      values: sourceValues,
      arrayLengths,
      maxPairwiseValues: options.maxPairwiseValues,
    });

    if (evidence !== undefined) {
      return { claim, status: evidence.kind, evidence };
    }
    return nearest === undefined
      ? { claim, status: "ungrounded" }
      : { claim, status: "ungrounded", nearest };
  });

  const exact = results.filter((r) => r.status === "exact").length;
  const derived = results.filter((r) => r.status === "derived").length;
  const ungrounded = results.filter((r) => r.status === "ungrounded").length;
  const total = results.length;

  return {
    results,
    sourceValues,
    stats: {
      total,
      exact,
      derived,
      ungrounded,
      // 主張が0件なら「根拠のない主張は無い」として 1 を返す。0除算を避ける意味もある。
      groundedRatio: total === 0 ? 1 : (exact + derived) / total,
    },
    truncated,
  };
}
