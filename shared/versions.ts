import { z } from 'zod';

export const repositoryUrl = 'https://github.com/finngck/Hacktober';
export const buildInfoSchema = z.object({
  version: z.string(),
  commit: z.string(),
  branch: z.string(),
  builtAt: z.string(),
  environment: z.string(),
  dirty: z.boolean(),
  repository: z.string(),
});
export const versionsSchema = z.object({
  commits: z.array(
    z.object({ sha: z.string(), message: z.string(), url: z.string(), date: z.string() }),
  ),
  deployments: z.array(
    z.object({
      id: z.number(),
      sha: z.string(),
      environment: z.string(),
      url: z.string(),
      date: z.string(),
    }),
  ),
  available: z.boolean(),
});
export type BuildInfo = z.infer<typeof buildInfoSchema>;
export type Versions = z.infer<typeof versionsSchema>;
