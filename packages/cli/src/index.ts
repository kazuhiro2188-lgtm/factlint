import { readFile } from "node:fs/promises";
import process from "node:process";
import { check } from "@factlint/core";
import { HELP_TEXT, parseCliArgs } from "./args.js";
import { renderGithub, renderHuman, renderJson } from "./render.js";

const VERSION = "0.1.0";

const EXIT_OK = 0;
const EXIT_UNGROUNDED = 1;
const EXIT_USAGE = 2;

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readInput(path: string): Promise<string> {
  return path === "-" ? readStdin() : readFile(path, "utf8");
}

/**
 * ソースを読む。JSON として読めればそのまま構造を活かし、
 * 読めなければ素のテキストとして扱う（ログやCSVをそのまま渡せるようにするため）。
 */
function parseSource(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

export async function run(argv: readonly string[]): Promise<number> {
  const command = parseCliArgs(argv);

  if (command.kind === "help") {
    process.stdout.write(HELP_TEXT);
    return EXIT_OK;
  }
  if (command.kind === "version") {
    process.stdout.write(`${VERSION}\n`);
    return EXIT_OK;
  }
  if (command.kind === "error") {
    process.stderr.write(`${command.message}\n\n${HELP_TEXT}`);
    return EXIT_USAGE;
  }

  let sourceRaw: string;
  let outputRaw: string;
  try {
    sourceRaw = await readInput(command.sourcePath);
    outputRaw = await readInput(command.outputPath);
  } catch (error) {
    process.stderr.write(`ファイルを読めませんでした: ${error instanceof Error ? error.message : String(error)}\n`);
    return EXIT_USAGE;
  }

  const report = check({
    source: parseSource(sourceRaw),
    output: outputRaw,
    ...(command.maxPairwiseValues === undefined
      ? {}
      : { options: { maxPairwiseValues: command.maxPairwiseValues } }),
  });

  const useColor = command.color ?? process.stdout.isTTY === true;

  switch (command.format) {
    case "json":
      process.stdout.write(`${renderJson(report)}\n`);
      break;
    case "github": {
      const annotations = renderGithub(report, command.outputPath);
      if (annotations !== "") process.stdout.write(`${annotations}\n`);
      break;
    }
    case "human":
      process.stdout.write(`${renderHuman(report, useColor)}\n`);
      break;
  }

  return report.stats.ungrounded > command.allowUngrounded ? EXIT_UNGROUNDED : EXIT_OK;
}

export { parseCliArgs, HELP_TEXT } from "./args.js";
export { renderGithub, renderHuman, renderJson } from "./render.js";
export type { CliCommand, OutputFormat } from "./args.js";
