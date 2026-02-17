import { z } from "zod";

export const taskSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  acceptanceCriteria: z.array(z.string()).min(1),
  risk: z.enum(["low", "medium", "high"]),
  expectedTouched: z.array(z.string()),
  tests: z.array(z.string()),
  verificationSteps: z.array(z.string()),
  rollbackPlan: z.array(z.string()),
  blastRadius: z.string().min(1),
  dependsOn: z.array(z.string()),
  ownerRole: z.enum(["planner", "executor", "reviewer", "debugger"]),
  estimate: z.number().nonnegative(),
  retries: z.number().int().nonnegative(),
  status: z.enum(["planned", "in_progress", "passed", "failed", "blocked"]),
  sourcePrdSections: z.array(z.string()).min(1),
  qualityGates: z.array(z.enum(["review", "tests", "security", "lint"])).default(["review", "tests"]),
  riskControls: z.array(z.string()).default([]),
});

export const storySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tasks: z.array(taskSchema),
});

export const epicSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  stories: z.array(storySchema),
});

export const taskGraphSchema = z.object({
  version: z.literal("1.2"),
  epics: z.array(epicSchema),
});

export type TaskGraph = z.infer<typeof taskGraphSchema>;
export type Epic = z.infer<typeof epicSchema>;
export type Story = z.infer<typeof storySchema>;
export type Task = z.infer<typeof taskSchema>;
