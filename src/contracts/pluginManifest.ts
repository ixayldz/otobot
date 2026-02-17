import { z } from "zod";

export const pluginManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  entry: z.string().min(1),
  permissions: z.array(z.string()).default([]),
  integrity: z.string().min(1),
  compat: z.object({
    minOtobotVersion: z.string().min(1),
  }),
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;
