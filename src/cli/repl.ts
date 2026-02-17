import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { OtobotApp } from "./app.js";

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const withCode = error as Error & { code?: string };
  return error.name === "AbortError" || withCode.code === "ABORT_ERR";
}

export async function startRepl(projectRoot: string): Promise<void> {
  const app = new OtobotApp(projectRoot);
  await app.init();

  const rl = createInterface({ input, output });
  output.write("otobot> Type /help for commands\n");

  try {
    while (true) {
      let line = "";
      try {
        line = await rl.question("otobot> ");
      } catch (error) {
        if (isAbortError(error)) {
          output.write("\n");
          break;
        }
        throw error;
      }

      const result = await app.run(line);

      if (result === "__EXIT__") {
        break;
      }

      if (result) {
        output.write(`${result}\n`);
      }
    }
  } finally {
    rl.close();
  }
}
