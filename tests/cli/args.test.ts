import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../../src/cli/args.js";

describe("parseCliArgs — 正常系", () => {
  it("source と output を読み取る", () => {
    const command = parseCliArgs(["--source", "data.json", "--output", "report.md"]);
    expect(command.kind).toBe("run");
    if (command.kind !== "run") return;
    expect(command.sourcePath).toBe("data.json");
    expect(command.outputPath).toBe("report.md");
  });

  it("短いオプションを受け付ける", () => {
    const command = parseCliArgs(["-s", "a.json", "-o", "b.md"]);
    expect(command.kind).toBe("run");
  });

  it("format の既定は human", () => {
    const command = parseCliArgs(["-s", "a.json", "-o", "b.md"]);
    if (command.kind !== "run") throw new Error("run になるはず");
    expect(command.format).toBe("human");
  });

  it("根拠なしの許容件数の既定は 0", () => {
    const command = parseCliArgs(["-s", "a.json", "-o", "b.md"]);
    if (command.kind !== "run") throw new Error("run になるはず");
    expect(command.allowUngrounded).toBe(0);
  });

  it("--no-color を色の無効化として読む", () => {
    const command = parseCliArgs(["-s", "a.json", "-o", "b.md", "--no-color"]);
    if (command.kind !== "run") throw new Error("run になるはず");
    expect(command.color).toBe(false);
  });

  it("色の指定が無ければ未定（実行時に端末かどうかで決める）", () => {
    const command = parseCliArgs(["-s", "a.json", "-o", "b.md"]);
    if (command.kind !== "run") throw new Error("run になるはず");
    expect(command.color).toBeUndefined();
  });
});

describe("parseCliArgs — ヘルプとバージョン", () => {
  it("--help は他の指定より優先する", () => {
    expect(parseCliArgs(["--help", "-s", "a.json"]).kind).toBe("help");
  });

  it("--version を認識する", () => {
    expect(parseCliArgs(["--version"]).kind).toBe("version");
  });
});

describe("parseCliArgs — 異常系", () => {
  it("source が無ければエラーにする", () => {
    const command = parseCliArgs(["--output", "b.md"]);
    expect(command.kind).toBe("error");
    if (command.kind !== "error") return;
    expect(command.message).toContain("--source");
  });

  it("output が無ければエラーにする", () => {
    const command = parseCliArgs(["--source", "a.json"]);
    expect(command.kind).toBe("error");
  });

  it("未知の format を拒否する", () => {
    const command = parseCliArgs(["-s", "a.json", "-o", "b.md", "--format", "xml"]);
    expect(command.kind).toBe("error");
    if (command.kind !== "error") return;
    expect(command.message).toContain("xml");
  });

  it("負の許容件数を拒否する", () => {
    expect(parseCliArgs(["-s", "a.json", "-o", "b.md", "--allow-ungrounded", "-1"]).kind).toBe("error");
  });

  it("整数でない上限を拒否する", () => {
    expect(parseCliArgs(["-s", "a.json", "-o", "b.md", "--max-pairwise", "1.5"]).kind).toBe("error");
  });

  it("知らないオプションを拒否する", () => {
    expect(parseCliArgs(["--unknown"]).kind).toBe("error");
  });
});
