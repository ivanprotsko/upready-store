import { z } from "@medusajs/framework/zod";

/**
 * `POST /tenants/agent-changesets` (t-2026-10-27-04). The ops are checked
 * one by one against the allow-list in the route (`lifecycle.checkOpsFor`),
 * which knows each route's own fields; here only the envelope is.
 */
export const PostAgentChangesetSchema = z
  .object({
    source: z.enum(["owner-voice", "telegram", "panel"]),
    summary: z.string().trim().max(500).nullish(),
    ops: z
      .array(
        z
          .object({
            method: z.enum(["POST", "PUT", "PATCH", "DELETE"]),
            path: z.string().min(1).max(500),
            body: z.record(z.string(), z.unknown()).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();

export type PostAgentChangesetBody = z.infer<typeof PostAgentChangesetSchema>;
