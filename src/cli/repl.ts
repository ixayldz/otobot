import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { OtobotApp } from "./app.js";

export async function startRepl(projectRoot: string): Promise<void> {
  const app = new OtobotApp(projectRoot);
  await app.init();

  const rl = createInterface({ input, output });
  output.write("otobot> Type /help for commands\n");

  try {
    while (true) {
      const line = await rl.question("otobot> ");
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
