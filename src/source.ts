import { extractClaims } from "./extract.js";
import type { ArrayLength, SourceValue } from "./types.js";

/** "portfolio.total" → "total" / "monthly[0]" → "monthly" */
function lastSegment(path: string): string {
  if (path === "") return "";
  const withoutIndex = path.replace(/\[\d+\]$/, "");
  const dot = withoutIndex.lastIndexOf(".");
  return dot === -1 ? withoutIndex : withoutIndex.slice(dot + 1);
}

export interface Collected {
  readonly values: SourceValue[];
  readonly arrayLengths: ArrayLength[];
}

function walk(node: unknown, path: string, group: string, out: Collected): void {
  if (typeof node === "number") {
    if (Number.isFinite(node)) {
      out.values.push({ value: node, path: path === "" ? "$" : path, label: lastSegment(path), group });
    }
    return;
  }

  if (typeof node === "string") {
    // 文字列の中に数値が埋まっていることは多い（ログ行、CSVの1行、JSONを文字列で渡した場合など）。
    for (const claim of extractClaims(node)) {
      out.values.push({
        value: claim.value,
        path: `${path === "" ? "text" : path}:${claim.offset}`,
        label: lastSegment(path),
        group,
      });
    }
    return;
  }

  if (Array.isArray(node)) {
    out.arrayLengths.push({ path: path === "" ? "$" : path, length: node.length });
    node.forEach((item, index) => {
      walk(item, `${path}[${index}]`, path === "" ? "$" : path, out);
    });
    return;
  }

  if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      walk(value, path === "" ? key : `${path}.${key}`, path, out);
    }
  }
}

/**
 * ソース（入力データ）から数値を集める。
 *
 * JSON でも素のテキストでも受け取れる。実務では「APIのレスポンスをそのまま渡す」
 * ケースが最も多いため、入れ子と配列を辿れることを優先している。
 */
export function collectSource(source: unknown): Collected {
  const out: Collected = { values: [], arrayLengths: [] };
  walk(source, "", "", out);
  return out;
}

/** 数値だけが要るときの入口。構造の情報は collectSource で受け取る。 */
export function collectSourceValues(source: unknown): SourceValue[] {
  return collectSource(source).values;
}
