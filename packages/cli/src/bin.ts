#!/usr/bin/env node
import process from "node:process";
import { run } from "./index.js";

/**
 * 実行可能ファイルの入口。ここには制御フローを置かない。
 * 判定と描画は index.ts / render.ts にあり、そちらはテストから直接呼べる。
 */
run(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`予期しないエラー: ${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 2;
  });
