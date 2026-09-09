import { matchesClaim } from "./match.js";
import type { ArrayLength, Claim, Evidence, NearestMiss, SourceValue } from "./types.js";

export interface Candidate {
  readonly value: number;
  /** 人が読んで検算できる形の説明。ここが読めないと利用者はツールを信用しない。 */
  readonly expression: string;
  /**
   * 割り算の商（倍率）であることの印。
   *
   * 「a ÷ b」は倍率であって百分率ではない。3.18倍を「3.2%」の根拠として
   * 認めてしまうと、根拠のない割合が通り抜ける。パーセントの主張には使わない。
   */
  readonly kind?: "ratio";
}

/** "assets(152800)" のように、ラベルと値をセットで書く。検算できることを優先する。 */
function describe(value: SourceValue): string {
  return value.label === "" ? String(value.value) : `${value.label}(${value.value})`;
}

/** 0除算を避けつつ商を返す。 */
function divide(a: number, b: number): number | undefined {
  if (b === 0) return undefined;
  const result = a / b;
  return Number.isFinite(result) ? result : undefined;
}

/**
 * 2値演算を許す組み合わせか。
 *
 * 無関係な2値を掛け合わせると、意味のない計算がたまたま主張の数値に一致してしまう。
 * 実際に「あるポジションの元本 ÷ 全体の負債 × 100 = 12.01」が、
 * 根拠のない「12%」を通してしまう事故が実データで出た（docs/adr/0002 に記録）。
 *
 * 現実の文章で人が行う計算は、ほぼ次のどちらかに収まる。
 *   - 同じまとまりの中の値どうし（同じ行の 回収額 ÷ 元本）
 *   - 同じ項目名の値どうし（各行の 元本 の合計）
 */
function relatable(a: SourceValue, b: SourceValue): boolean {
  return a.group === b.group || (a.label !== "" && a.label === b.label);
}

/** 集約（合計・平均・最大・最小・件数）。グループ単位でも全体でも同じ関数を使う。 */
function* aggregates(values: readonly SourceValue[], scope: string): Generator<Candidate> {
  if (values.length === 0) return;

  const numbers = values.map((v) => v.value);
  const sum = numbers.reduce((acc, n) => acc + n, 0);
  const where = `${scope}: ${values.length}件`;

  yield { value: sum, expression: `合計(${where})` };
  yield { value: sum / values.length, expression: `平均(${where})` };
  yield { value: Math.max(...numbers), expression: `最大(${where})` };
  yield { value: Math.min(...numbers), expression: `最小(${where})` };
}

/**
 * 2値の演算。AIが文章の中で実際に書く計算に絞ってある。
 * 任意の四則演算を深く探索すると偶然の一致が増え、根拠なしをほぼ検出できなくなる（ADR-0002）。
 */
function* pairOperations(a: SourceValue, b: SourceValue): Generator<Candidate> {
  const la = describe(a);
  const lb = describe(b);

  yield { value: a.value + b.value, expression: `${la} + ${lb}` };
  yield { value: a.value - b.value, expression: `${la} - ${lb}` };
  yield { value: b.value - a.value, expression: `${lb} - ${la}` };

  const aOverB = divide(a.value, b.value);
  if (aOverB !== undefined) {
    yield { value: aOverB, expression: `${la} ÷ ${lb}`, kind: "ratio" };
    yield { value: aOverB * 100, expression: `${la} ÷ ${lb} × 100` };
    yield { value: ((a.value - b.value) / b.value) * 100, expression: `(${la} - ${lb}) ÷ ${lb} × 100` };
  }

  const bOverA = divide(b.value, a.value);
  if (bOverA !== undefined) {
    yield { value: bOverA, expression: `${lb} ÷ ${la}`, kind: "ratio" };
    yield { value: bOverA * 100, expression: `${lb} ÷ ${la} × 100` };
    yield { value: ((b.value - a.value) / a.value) * 100, expression: `(${lb} - ${la}) ÷ ${la} × 100` };
  }
}

export interface DeriveInput {
  readonly values: readonly SourceValue[];
  /** 配列の要素数。「2件のポジション」のような件数の主張を、素直な根拠で説明するために持つ */
  readonly arrayLengths: readonly ArrayLength[];
  readonly maxPairwiseValues: number;
}

/**
 * ソース値から計算で到達できる候補を、順に生成する。
 *
 * 配列に貯めずジェネレータにしているのは、候補が2値演算だけで件数の2乗に比例するため。
 */
export function* derivedCandidates(input: DeriveInput): Generator<Candidate> {
  const { values, arrayLengths, maxPairwiseValues } = input;

  for (const { path, length } of arrayLengths) {
    yield { value: length, expression: `要素数(${path})` };
  }

  yield* aggregates(values, "全体");

  const groups = new Map<string, SourceValue[]>();
  for (const value of values) {
    if (value.group === "") continue;
    const bucket = groups.get(value.group);
    if (bucket === undefined) groups.set(value.group, [value]);
    else bucket.push(value);
  }
  for (const [name, bucket] of groups) {
    if (bucket.length === values.length) continue; // 全体と同じ集合なら重複するだけ
    yield* aggregates(bucket, name);
  }

  // 同じラベル（項目名）の値をまたいで集約する。「各行の元本の合計」がこれに当たる。
  const byLabel = new Map<string, SourceValue[]>();
  for (const value of values) {
    if (value.label === "") continue;
    const bucket = byLabel.get(value.label);
    if (bucket === undefined) byLabel.set(value.label, [value]);
    else bucket.push(value);
  }
  for (const [label, bucket] of byLabel) {
    if (bucket.length < 2) continue;
    yield* aggregates(bucket, `${label} 横断`);
  }

  // 件数が多すぎるときは2値演算を諦める。諦めたことは Report.truncated で申告する。
  if (values.length > maxPairwiseValues) return;

  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      const a = values[i];
      const b = values[j];
      if (a === undefined || b === undefined) continue;
      if (!relatable(a, b)) continue;
      yield* pairOperations(a, b);
    }
  }
}

export interface EvidenceLookup {
  readonly evidence?: Evidence;
  readonly nearest?: NearestMiss;
}

/** 説明としての良さ。差が小さいほど、式が短いほど良い根拠とみなす。 */
function isBetter(candidate: Candidate, current: Candidate, claimValue: number): boolean {
  const dNew = Math.abs(candidate.value - claimValue);
  const dOld = Math.abs(current.value - claimValue);
  if (dNew !== dOld) return dNew < dOld;
  return candidate.expression.length < current.expression.length;
}

/**
 * 主張ひとつに対して根拠を探す。
 *
 * ソースにそのまま在る値を先に見るのは、「合計としても解釈できる」ような値に対して
 * より素直な根拠を選ぶため。最初に一致したものではなく、最もぴったり合うものを採る。
 */
export function findEvidence(claim: Claim, input: DeriveInput): EvidenceLookup {
  let nearest: NearestMiss | undefined;

  const remember = (value: number, expression: string): void => {
    if (!Number.isFinite(value)) return;
    const delta = Math.abs(value - claim.value);
    if (nearest === undefined || delta < nearest.delta) {
      nearest = { expression, value, delta };
    }
  };

  let bestExact: Candidate | undefined;
  for (const value of input.values) {
    const candidate: Candidate = { value: value.value, expression: describe(value) };
    if (matchesClaim(claim, value.value)) {
      if (bestExact === undefined || isBetter(candidate, bestExact, claim.value)) bestExact = candidate;
    }
    remember(value.value, candidate.expression);
  }
  if (bestExact !== undefined) {
    return { evidence: { kind: "exact", expression: bestExact.expression, value: bestExact.value } };
  }

  let bestDerived: Candidate | undefined;
  for (const candidate of derivedCandidates(input)) {
    // 倍率をパーセントの根拠にしない。3.18倍は「3.2%」の説明にならない
    if (claim.unit === "percent" && candidate.kind === "ratio") {
      remember(candidate.value, candidate.expression);
      continue;
    }
    if (matchesClaim(claim, candidate.value)) {
      if (bestDerived === undefined || isBetter(candidate, bestDerived, claim.value)) bestDerived = candidate;
    }
    remember(candidate.value, candidate.expression);
  }
  if (bestDerived !== undefined) {
    return { evidence: { kind: "derived", expression: bestDerived.expression, value: bestDerived.value } };
  }

  return nearest === undefined ? {} : { nearest };
}
