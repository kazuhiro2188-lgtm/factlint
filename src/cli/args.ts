import { parseArgs } from "node:util";

export type OutputFormat = "human" | "json" | "github";

export type CliCommand =
  | { readonly kind: "help" }
  | { readonly kind: "version" }
  | { readonly kind: "error"; readonly message: string }
  | {
      readonly kind: "run";
      readonly sourcePath: string;
      readonly outputPath: string;
      readonly format: OutputFormat;
      readonly maxPairwiseValues: number | undefined;
      /** 根拠なしを何件まで許すか。既定は0（1件でもあれば失敗） */
      readonly allowUngrounded: number;
      /** 未指定なら端末かどうかで自動判定する */
      readonly color: boolean | undefined;
    };

const FORMATS: readonly string[] = ["human", "json", "github"];

function toPositiveInteger(raw: string | undefined, name: string): number | undefined | Error {
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return new Error(`${name} には0以上の整数を指定してください（受け取った値: ${raw}）`);
  }
  return parsed;
}

/**
 * コマンドライン引数を解釈する。
 * 副作用を持たせず純粋関数にしてあるのは、テストから素直に呼べるようにするため。
 */
export function parseCliArgs(argv: readonly string[]): CliCommand {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      options: {
        source: { type: "string", short: "s" },
        output: { type: "string", short: "o" },
        format: { type: "string", short: "f" },
        "max-pairwise": { type: "string" },
        "allow-ungrounded": { type: "string" },
        color: { type: "boolean" },
        "no-color": { type: "boolean" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
      allowPositionals: false,
      strict: true,
    });
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }

  const values = parsed.values;
  if (values.help === true) return { kind: "help" };
  if (values.version === true) return { kind: "version" };

  if (typeof values.source !== "string" || values.source === "") {
    return { kind: "error", message: "--source（入力データ）を指定してください" };
  }
  if (typeof values.output !== "string" || values.output === "") {
    return { kind: "error", message: "--output（検証するAI生成文）を指定してください" };
  }

  const format = values.format ?? "human";
  if (!FORMATS.includes(format)) {
    return { kind: "error", message: `--format は ${FORMATS.join(" / ")} のいずれかです（受け取った値: ${format}）` };
  }

  const maxPairwise = toPositiveInteger(values["max-pairwise"], "--max-pairwise");
  if (maxPairwise instanceof Error) return { kind: "error", message: maxPairwise.message };

  const allow = toPositiveInteger(values["allow-ungrounded"], "--allow-ungrounded");
  if (allow instanceof Error) return { kind: "error", message: allow.message };

  return {
    kind: "run",
    sourcePath: values.source,
    outputPath: values.output,
    format: format as OutputFormat,
    maxPairwiseValues: maxPairwise,
    allowUngrounded: allow ?? 0,
    color: values["no-color"] === true ? false : values.color === true ? true : undefined,
  };
}

export const HELP_TEXT = `factlint — AI生成文の数値に、根拠があるかを機械的に確かめる

使い方:
  factlint --source <入力データ> --output <AI生成文>

  --source, -s            入力データ。JSON でも素のテキストでもよい。- で標準入力
  --output, -o            検証するAI生成文。- で標準入力
  --format, -f            human（既定） / json / github
  --max-pairwise <n>      2値演算を行うソース値の上限（既定 80）
  --allow-ungrounded <n>  根拠なしを何件まで許すか（既定 0）
  --no-color              色を付けない
  --help, -h              このヘルプ
  --version, -v           バージョン

終了コード:
  0  根拠なしが許容件数以内
  1  根拠なしが許容件数を超えた
  2  引数やファイルの誤り

例:
  factlint -s data.json -o report.md
  cat report.md | factlint -s data.json -o - --format github
`;
