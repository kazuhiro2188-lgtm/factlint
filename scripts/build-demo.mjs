// ブラウザ用デモの組み立て。
// core は実行時依存がゼロの純粋な ESM なので、バンドラを通さず「そのままコピーする」だけで
// ブラウザから import できる。ビルド工程を持たないこと自体が、この設計の証明になっている。
import { cp, rm, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const from = resolve(root, "packages/core/dist");
const to = resolve(root, "apps/demo/engine");

await rm(to, { recursive: true, force: true });
await mkdir(to, { recursive: true });
await cp(from, to, { recursive: true });

console.log(`エンジンを配置しました: ${to}`);
