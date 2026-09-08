/**
 * 出力文に現れた数値の単位。判定そのものには使わないが、
 * レポートの読みやすさと、比率（%）候補の生成方針に効く。
 */
export type Unit = "percent" | "currency" | "duration" | "count" | "plain";

/** AI生成文から取り出した、根拠を問うべき数値ひとつ。 */
export interface Claim {
  /** 元の表記そのまま（例: "$152,800"） */
  readonly raw: string;
  /** 正規化した値（例: 152800） */
  readonly value: number;
  readonly unit: Unit;
  /** 「約」「about」などの概数表現を伴うか */
  readonly approximate: boolean;
  /** 書かれた小数桁数。丸めの許容幅を決める */
  readonly decimals: number;
  /** 有効桁数。概数の許容幅を決める（末尾のゼロは有意としない） */
  readonly significantDigits: number;
  /** 文字列全体での開始位置 */
  readonly offset: number;
  /** 1始まり */
  readonly line: number;
  /** 1始まり */
  readonly column: number;
}

/** ソース（入力データ）に存在した数値ひとつ。 */
export interface SourceValue {
  readonly value: number;
  /** JSONパス（例: "portfolio.assets[0]"）またはテキスト上の位置 */
  readonly path: string;
  /** 直近のキー名。説明文に使う */
  readonly label: string;
  /** 同じ親を持つ値のグループ。グループ単位の集約に使う */
  readonly group: string;
}

/** ソースに含まれていた配列の長さ。「2件のポジション」という主張の根拠になる。 */
export interface ArrayLength {
  readonly path: string;
  readonly length: number;
}

/** その数値がソースから辿れた根拠。 */
export interface Evidence {
  /** exact = ソースにその値がある / derived = 計算で導ける */
  readonly kind: "exact" | "derived";
  /** 到達経路の説明（例: "assets(152800) ÷ liabilities(167400) × 100"） */
  readonly expression: string;
  /** 計算結果（丸める前） */
  readonly value: number;
}

/** 根拠なしと判定した際の、最も近い候補。 */
export interface NearestMiss {
  readonly expression: string;
  readonly value: number;
  /** 主張値との差の絶対値 */
  readonly delta: number;
}

export type ClaimStatus = "exact" | "derived" | "ungrounded";

export interface ClaimResult {
  readonly claim: Claim;
  readonly status: ClaimStatus;
  /** status が exact / derived のときのみ存在 */
  readonly evidence?: Evidence;
  /** status が ungrounded のときのみ存在。候補が皆無なら省略 */
  readonly nearest?: NearestMiss;
}

export interface ExtractOptions {
  /** 西暦（1900〜2100 の裸の4桁整数）を数値として扱わない */
  readonly ignoreYears: boolean;
  /** 日付・時刻表記を数値として扱わない */
  readonly ignoreDates: boolean;
  /** バージョン番号（v1.2.3）を数値として扱わない */
  readonly ignoreVersions: boolean;
  /** 箇条書きの番号（行頭の "1." "2)"）を数値として扱わない */
  readonly ignoreListMarkers: boolean;
}

export interface CheckOptions extends ExtractOptions {
  /**
   * 2値演算の候補生成を行うソース値の上限。
   * 超えた場合は集約のみで判定し、Report.truncated を立てる。
   */
  readonly maxPairwiseValues: number;
}

export interface CheckInput {
  /** 入力データ。JSON（オブジェクト/配列/数値）でも、素のテキストでもよい */
  readonly source: unknown;
  /** 検証対象のAI生成文 */
  readonly output: string;
  readonly options?: Partial<CheckOptions>;
}

export interface Report {
  readonly results: readonly ClaimResult[];
  readonly sourceValues: readonly SourceValue[];
  readonly stats: {
    readonly total: number;
    readonly exact: number;
    readonly derived: number;
    readonly ungrounded: number;
    /** 根拠ありの割合（0〜1）。主張が0件なら 1 */
    readonly groundedRatio: number;
  };
  /**
   * ソース値が多すぎて2値演算を打ち切った場合に true。
   * 精度を黙って落とさないための申告。
   */
  readonly truncated: boolean;
}
