import { taskGraphSchema, type Task, type TaskGraph } from "../../contracts/taskGraph.js";
import type { OtobotState } from "../../contracts/state.js";
import { AuditLogger } from "../audit/logger.js";
import type { PolicyPack } from "../policy/packs.js";
import { runCommandWithSandbox } from "../sandbox/executor.js";

export interface BuildSummary {
  succeeded: boolean;
  completedTasks: string[];
  failedTask?: string;
}

export interface BuildRunOptions {
  projectRoot: string;
  sandbox: OtobotState["sandbox"];
  policy: PolicyPack | null;
  executeCommands: boolean;
}

function flattenTasks(graph: TaskGraph): Task[] {
  return graph.epics.flatMap((epic) => epic.stories.flatMap((story) => story.tasks));
}

function orderTasks(tasks: Task[]): Task[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const done = new Set<string>();
  const ordered: Task[] = [];

  while (ordered.length < tasks.length) {
    let progressed = false;

    for (const task of tasks) {
      if (done.has(task.id)) {
        continue;
      }

      const depsOk = task.dependsOn.every((dep) => done.has(dep) || !byId.has(dep));
      if (!depsOk) {
        continue;
      }

      ordered.push(task);
      done.add(task.id);
      progressed = true;
    }

    if (!progressed) {
      const remaining = tasks.filter((t) => !done.has(t.id));
      ordered.push(...remaining);
      break;
    }
  }

  return ordered;
}

async function runTask(task: Task, audit: AuditLogger, options: BuildRunOptions): Promise<boolean> {
  await audit.info("build.task.start", "Executing task lifecycle", {
    task: task.id,
    retries: task.retries,
    dependsOn: task.dependsOn,
    qualityGates: task.qualityGates,
    riskControls: task.riskControls,
  });

  if (task.qualityGates.includes("tests") && task.tests.length === 0) {
    await audit.error("build.task.failed", "Task missing required tests quality gate", {
      task: task.id,
    });
    return false;
  }

  if (task.qualityGates.includes("security") && task.riskControls.length === 0) {
    await audit.error("build.task.failed", "Task missing security risk controls", {
      task: task.id,
    });
    return false;
  }

  const forcedFailTask = process.env.OTOBOT_FORCE_FAIL_TASK;

  for (let attempt = 0; attempt <= task.retries; attempt += 1) {
    if (forcedFailTask && forcedFailTask === task.id) {
      await audit.warn("build.task.retry", "Forced task failure for testing", {
        task: task.id,
        attempt,
      });
      continue;
    }

    for (const testCommand of task.tests) {
      const execution = await runCommandWithSandbox({
        projectRoot: options.projectRoot,
        command: testCommand,
        sandbox: options.sandbox,
        policy: options.policy,
        execute: options.executeCommands,
      });

      await audit.info("build.task.command", "Task command processed", {
        task: task.id,
        command: testCommand,
        mode: execution.mode,
        blocked: execution.blocked,
        exitCode: execution.exitCode,
        warnings: execution.warnings,
      });

      if (execution.blocked || !execution.ok) {
        await audit.error("build.task.failed", "Task command failed", {
          task: task.id,
          command: testCommand,
          reason: execution.reason,
          stderr: execution.stderr,
        });
        return false;
      }
    }

    await audit.info("build.task.complete", "Task completed", {
      task: task.id,
      blastRadius: task.blastRadius,
      attempt,
    });
    return true;
  }

  await audit.error("build.task.failed", "Task retries exhausted", { task: task.id });
  return false;
}

export async function runBuildCycle(
  _currentState: string,
  graphRaw: unknown,
  audit: AuditLogger,
  options: BuildRunOptions,
): Promise<BuildSummary> {
  const graph = taskGraphSchema.parse(graphRaw);
  const completedTasks: string[] = [];

  const ordered = orderTasks(flattenTasks(graph));

  for (const task of ordered) {
    const ok = await runTask(task, audit, options);
    if (!ok) {
      return {
        succeeded: false,
        completedTasks,
        failedTask: task.id,
      };
    }

    completedTasks.push(task.id);
  }

  return {
    succeeded: true,
    completedTasks,
  };
}
