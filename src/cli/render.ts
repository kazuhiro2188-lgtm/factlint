import type { ClaimResult, Report } from "../index.js";

/** 端末の色。CI やパイプ経由では自動的に無効化する。 */
interface Palette {
  readonly ok: (s: string) => string;
  readonly warn: (s: string) => string;
  readonly bad: (s: string) => string;
  readonly dim: (s: string) => string;
  readonly bold: (s: string) => string;
}

const plain: Palette = {
  ok: (s) => s,
  warn: (s) => s,
  bad: (s) => s,
  dim: (s) => s,
  bold: (s) => s,
};

const colored: Palette = {
  ok: (s) => `\u001B[32m${s}\u001B[0m`,
  warn: (s) => `\u001B[33m${s}\u001B[0m`,
  bad: (s) => `\u001B[31m${s}\u001B[0m`,
  dim: (s) => `\u001B[90m${s}\u001B[0m`,
  bold: (s) => `\u001B[1m${s}\u001B[0m`,
};

export function paletteFor(useColor: boolean): Palette {
  return useColor ? colored : plain;
}

/** 小数を読める桁に丸める。根拠の説明に長い小数を出しても誰も読まないため。 */
function short(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toPrecision(6)));
}

function statusLabel(result: ClaimResult, palette: Palette): string {
  switch (result.status) {
    case "exact":
      return palette.ok("✓ exact     ");
    case "derived":
      return palette.ok("✓ derived   ");
    case "ungrounded":
      return palette.bad("✗ ungrounded");
  }
}

/** 人が読む用。根拠なしを目で拾えることだけを狙う。 */
export function renderHuman(report: Report, useColor: boolean): string {
  const palette = paletteFor(useColor);
  const lines: string[] = [];

  for (const result of report.results) {
    const where = palette.dim(`${result.claim.line}:${result.claim.column}`);
    const head = `  ${statusLabel(result, palette)}  ${result.claim.raw.padEnd(14)} ${where}`;

    if (result.evidence !== undefined) {
      lines.push(`${head}  ${palette.dim(`${result.evidence.expression} = ${short(result.evidence.value)}`)}`);
    } else if (result.nearest !== undefined) {
      lines.push(head);
      lines.push(
        palette.dim(
          `      最も近い候補: ${result.nearest.expression} = ${short(result.nearest.value)}  (差 ${short(result.nearest.delta)})`,
        ),
      );
    } else {
      lines.push(head);
      lines.push(palette.dim("      候補なし（ソースに数値が無い）"));
    }
  }

  const { total, exact, derived, ungrounded, groundedRatio } = report.stats;
  lines.push("");

  if (total === 0) {
    lines.push(palette.dim("  検証対象の数値はありませんでした。"));
  } else {
    const ratio = `${(groundedRatio * 100).toFixed(1)}%`;
    const summary = `  ${total}件中 ${exact + derived}件に根拠あり (${ratio})  ${palette.dim(`exact ${exact} / derived ${derived}`)}`;
    lines.push(ungrounded === 0 ? palette.ok(summary) : summary);
    if (ungrounded > 0) {
      lines.push(palette.bad(`  根拠なし ${ungrounded}件`));
    }
  }

  if (report.truncated) {
    lines.push(
      palette.warn("  注意: ソースの数値が多いため2値演算の候補生成を打ち切りました（集約のみで判定）。"),
    );
  }

  return lines.join("\n");
}

/** 機械が読む用。CI から結果を拾って別の処理につなぐ場合はこちら。 */
export function renderJson(report: Report): string {
  return JSON.stringify(
    {
      stats: report.stats,
      truncated: report.truncated,
      results: report.results.map((r) => ({
        raw: r.claim.raw,
        value: r.claim.value,
        unit: r.claim.unit,
        line: r.claim.line,
        column: r.claim.column,
        status: r.status,
        evidence: r.evidence ?? null,
        nearest: r.nearest ?? null,
      })),
    },
    null,
    2,
  );
}

/**
 * GitHub Actions のアノテーション形式。
 * この形で出すと、プルリクエストの差分画面に直接印が付く。
 */
export function renderGithub(report: Report, file: string): string {
  return report.results
    .filter((r) => r.status === "ungrounded")
    .map((r) => {
      const hint =
        r.nearest === undefined
          ? "ソースに候補となる数値がありません"
          : `最も近い候補: ${r.nearest.expression} = ${short(r.nearest.value)}`;
      return `::error file=${file},line=${r.claim.line},col=${r.claim.column}::${r.claim.raw} はソースから根拠を辿れません。${hint}`;
    })
    .join("\n");
}
