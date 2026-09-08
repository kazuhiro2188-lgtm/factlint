import type { Claim, ExtractOptions, Unit } from "./types.js";

export const DEFAULT_EXTRACT_OPTIONS: ExtractOptions = {
  ignoreYears: true,
  ignoreDates: true,
  ignoreVersions: true,
  ignoreListMarkers: true,
};

/** 概数を示す語。これが付くと許容幅を有効桁数ベースに切り替える。 */
const APPROX = "約|およそ|おおよそ|概ね|凡そ|ほぼ|approximately|approx\\.?|about|around|~|≈";

const CURRENCY_SYMBOL = "[$¥€£]";

/** 日本語の位取り。数値に乗じる。 */
const MULTIPLIERS: Readonly<Record<string, number>> = {
  千: 1e3,
  万: 1e4,
  億: 1e8,
  兆: 1e12,
};

const UNITS = "%|％|パーセント|ポイント|円|ドル|件|本|人|回|社|台|個|倍|秒|ミリ秒|ms|分|時間|GB|MB|KB";

/** カンマ区切りつき、または素の数値。 */
const NUMBER = "\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?";

/**
 * 数値トークン全体。前後の修飾は「その修飾が実在するときだけ」空白を食う書き方にしてある
 * （`\\s?` を任意グループの内側に置く）。外に出すと "100 でした" の空白まで raw に混ざる。
 */
const TOKEN_RE = new RegExp(
  `(?:(${APPROX})\\s*)?` +
    `(?:(${CURRENCY_SYMBOL})\\s*)?` +
    `([-−▲])?` +
    `(${NUMBER})` +
    `(?:\\s?(千|万|億|兆))?` +
    `(?:\\s?(${UNITS}))?`,
  "gu",
);

const YEAR_MIN = 1900;
const YEAR_MAX = 2100;

type Range = readonly [start: number, end: number];

/** 数値として数えない領域（日付・バージョン・箇条書き番号）を洗い出す。 */
function maskedRanges(text: string, options: ExtractOptions): Range[] {
  const ranges: Range[] = [];

  const collect = (pattern: RegExp): void => {
    for (const match of text.matchAll(pattern)) {
      if (match.index !== undefined) {
        ranges.push([match.index, match.index + match[0].length]);
      }
    }
  };

  if (options.ignoreDates) {
    collect(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/g);
    collect(/\d{4}\s?年\s?\d{1,2}\s?月\s?\d{1,2}\s?日/g);
    collect(/\d{1,2}\s?月\s?\d{1,2}\s?日/g);
    collect(/\d{1,2}:\d{2}(?::\d{2})?/g);
  }
  if (options.ignoreVersions) {
    collect(/v?\d+\.\d+(?:\.\d+)+/g);
  }
  if (options.ignoreListMarkers) {
    collect(/^[ \t]*\d+[.)]\s/gm);
  }

  return ranges;
}

function isMasked(ranges: readonly Range[], start: number, end: number): boolean {
  return ranges.some(([from, to]) => start < to && end > from);
}

/** 各行の開始オフセット。行番号・桁番号の算出に使う。 */
function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

function positionOf(starts: readonly number[], offset: number): { line: number; column: number } {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const start = starts[mid];
    if (start !== undefined && start <= offset) low = mid;
    else high = mid - 1;
  }
  return { line: low + 1, column: offset - (starts[low] ?? 0) + 1 };
}

function countDecimals(numeric: string): number {
  const dot = numeric.indexOf(".");
  return dot === -1 ? 0 : numeric.length - dot - 1;
}

/**
 * 有効桁数。小数点が無い場合は末尾のゼロを有意としない。
 * 「約1,800」は上位2桁までの主張であり、1833 を丸めれば一致する、という扱いにするため。
 */
function countSignificantDigits(numeric: string): number {
  if (numeric.includes(".")) {
    const digits = numeric.replace(".", "").replace(/^0+/, "");
    return Math.max(digits.length, 1);
  }
  const digits = numeric.replace(/^0+/, "").replace(/0+$/, "");
  return Math.max(digits.length, 1);
}

function unitOf(currency: string | undefined, suffix: string | undefined): Unit {
  if (suffix === "%" || suffix === "％" || suffix === "パーセント" || suffix === "ポイント") {
    return "percent";
  }
  if (currency !== undefined || suffix === "円" || suffix === "ドル") return "currency";
  if (suffix === "秒" || suffix === "ミリ秒" || suffix === "ms" || suffix === "分" || suffix === "時間") {
    return "duration";
  }
  if (suffix !== undefined) return "count";
  return "plain";
}

/**
 * AI生成文から、根拠を問うべき数値を出現順に取り出す。
 *
 * 誤検知はツールが使われなくなる直接の原因になるため、
 * 西暦・日付・バージョン・箇条書き番号は既定で数値として扱わない。
 */
export function extractClaims(text: string, options: Partial<ExtractOptions> = {}): Claim[] {
  const resolved: ExtractOptions = { ...DEFAULT_EXTRACT_OPTIONS, ...options };
  const masked = maskedRanges(text, resolved);
  const starts = lineStarts(text);
  const claims: Claim[] = [];

  for (const match of text.matchAll(TOKEN_RE)) {
    if (match.index === undefined) continue;

    const [raw, approxMarker, currency, signMarker, numeric, multiplier, suffix] = match;
    if (numeric === undefined) continue;

    if (isMasked(masked, match.index, match.index + raw.length)) continue;

    // "152,800-167,400" のような並びで、後続の数値の符号を誤って負にしないための保険。
    const charBefore = match.index > 0 ? text[match.index - 1] : undefined;
    const signApplies = signMarker !== undefined && !(charBefore !== undefined && /[\d.]/.test(charBefore));

    const cleaned = numeric.replace(/,/g, "");
    const magnitude = multiplier !== undefined ? (MULTIPLIERS[multiplier] ?? 1) : 1;
    const value = Number(cleaned) * magnitude * (signApplies ? -1 : 1);
    if (!Number.isFinite(value)) continue;

    const unit = unitOf(currency, suffix);

    const bareInteger =
      unit === "plain" &&
      multiplier === undefined &&
      !numeric.includes(",") &&
      !numeric.includes(".") &&
      Number.isInteger(value);

    if (resolved.ignoreYears && bareInteger && value >= YEAR_MIN && value <= YEAR_MAX) continue;

    const { line, column } = positionOf(starts, match.index);

    claims.push({
      raw,
      value,
      unit,
      approximate: approxMarker !== undefined,
      decimals: countDecimals(cleaned),
      significantDigits: countSignificantDigits(cleaned),
      offset: match.index,
      line,
      column,
    });
  }

  return claims;
}
