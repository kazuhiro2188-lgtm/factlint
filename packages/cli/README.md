# factlint

AI生成文の数値に根拠があるかを確かめるコマンドライン。CI に組み込んで、根拠のない数値があればビルドを落とせる。

```bash
npx factlint --source data.json --output report.md
```

終了コード: `0` = 許容件数以内 / `1` = 超過 / `2` = 引数やファイルの誤り

`--format github` を付けると、プルリクエストの差分に注釈が付く。

詳細は[リポジトリの README](https://github.com/kazuhiro2188-lgtm/factlint) を参照。
