import { existsSync, readFileSync } from "node:fs";

import { appendOAuthTokenLog, oauthTokenLogPath } from "./oauth-token-log";

// One stage = one seeded `playwright test` run. The header and the summary frame the calls the
// workers append in between (INC-07).
export default function oauthTokenStage(): () => void {
  const selected = process.env.CORE_TEST_FILES?.trim() ?? "";
  const files = selected === "" ? "all spec files" : selected;
  const marker = `# stage start ${new Date().toISOString()} · ${files}`;
  appendOAuthTokenLog(marker);
  return () => {
    const log = existsSync(oauthTokenLogPath()) ? readFileSync(oauthTokenLogPath(), "utf8") : "";
    const calls = log
      .slice(log.lastIndexOf(marker) + marker.length)
      .split("\n")
      .filter((line) => line !== "" && !line.startsWith("#"));
    const failed = calls.filter((line) => !/ status=2\d\d /u.test(line));
    appendOAuthTokenLog(
      `# stage end ${new Date().toISOString()} · ${files} · ${String(calls.length)} calls · ${String(failed.length)} non-2xx`,
    );
  };
}
