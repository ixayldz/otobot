import { z } from "zod";

export const lockScopeSchema = z.object({
  in: z.array(z.string()),
  out: z.array(z.string()),
});

export const changeRequestPolicySchema = z.object({
  required: z.boolean(),
  approvers: z.array(z.string()),
  approvalMode: z.enum(["any_of", "all_of"]),
  requiredApprovals: z.number().int().positive(),
  auditRequired: z.boolean(),
  requiredEvidence: z.array(z.string()).default(["prd-diff", "approval-note"]),
  approvalSlaHours: z.number().int().positive().default(24),
});

export const stackHintsSchema = z.object({
  language: z.string(),
  frameworks: z.array(z.string()),
  db: z.string(),
});

export const prdLockSchema = z.object({
  version: z.literal("1.2"),
  contractVersion: z.literal("1.2"),
  lockedAt: z.string(),
  hashAlgo: z.literal("sha256"),
  hashScope: z.array(z.string()).min(1),
  prdHash: z.string().min(1),
  scope: lockScopeSchema,
  changeRequestPolicy: changeRequestPolicySchema,
  stackHints: stackHintsSchema,
});

export type PrdLock = z.infer<typeof prdLockSchema>;
