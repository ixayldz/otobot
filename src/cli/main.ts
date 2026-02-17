import { Command } from "commander";
import { cwd } from "node:process";
import { startRepl } from "./repl.js";
import { OtobotApp } from "./app.js";

export async function runCli(argv: string[]): Promise<void> {
  if (argv[2] === "run") {
    const app = new OtobotApp(cwd());
    await app.init();
    const input = argv.slice(3).join(" ");
    const output = await app.run(input);
    if (output && output !== "__EXIT__") {
      process.stdout.write(`${output}\n`);
    }
    return;
  }

  const program = new Command();
  program.name("otobot").description("Capability-aware PRD-to-production orchestrator");
  program.allowUnknownOption(true);

  program
    .command("repl")
    .description("Start interactive REPL")
    .action(async () => {
      await startRepl(cwd());
    });

  if (argv.length <= 2) {
    await startRepl(cwd());
    return;
  }

  await program.parseAsync(argv);
}
