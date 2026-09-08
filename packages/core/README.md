# factlint-core

AI生成文の数値が、ソースデータから辿れるかを判定するエンジン。**実行時依存ゼロ。AIを呼ばない。**

```ts
import { check } from "factlint-core";

const report = check({
  source: { assets: 152800, liabilities: 167400 },
  output: "充足率は 91.3% です。前月比 12% 改善しました。",
});

report.results[0].status; // "derived"  152800 ÷ 167400 × 100 = 91.28
report.results[1].status; // "ungrounded"
```

純粋な ESM なので、バンドラを通さずブラウザからそのまま `import` できる。

詳細は[リポジトリの README](https://github.com/kazuhiro2188-lgtm/factlint) を参照。
