import { Router } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import type { Db } from "@wiki/db";
import { users } from "@wiki/db";
import { ValidationError } from "../../lib/errors.js";
import {
  canRunSearch,
  resolveAccessibleSpaceIds,
} from "../access/permissionResolver.js";
import { searchDocuments, suggestDocumentTitles } from "./searchService.js";
import type { SearchQuery } from "@wiki/types";

const querySchema = z
  .object({
    q: z.string().max(500).optional().default(""),
    spaceId: z.string().uuid().optional(),
    type: z.enum(["page", "pdf"]).optional(),
    authorId: z.string().uuid().optional(),
    tags: z
      .string()
      .optional()
      .transform((v) => (v ? v.split(",").map((t) => t.trim()).filter(Boolean) : undefined)),
    from: z.string().optional(),
    to: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    size: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine(
    (data) =>
      data.q.trim().length > 0 ||
      data.spaceId ||
      data.type ||
      data.authorId ||
      (data.tags && data.tags.length > 0) ||
      data.from ||
      data.to,
    { message: "Provide a search query or at least one filter" },
  );

export function createSearchRouter(db: Db): Router {
  const router = Router();

  router.get("/search", async (req, res) => {
    const { orgId, userId, userRole, groupIds } = req.tenant;
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.flatten());
    }

    const canSearch = await canRunSearch({ db, userRole, userId, groupIds, orgId });
    const accessibleSpaceIds = await resolveAccessibleSpaceIds({
      db,
      userRole,
      userId,
      groupIds,
    });

    if (parsed.data.authorId) {
      const authorRows = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, parsed.data.authorId), eq(users.orgId, orgId)));
      if (!authorRows.length) {
        res.json({
          data: {
            hits: [],
            total: 0,
            page: parsed.data.page,
            size: parsed.data.size,
          },
        });
        return;
      }
    }

    if (
      parsed.data.spaceId &&
      accessibleSpaceIds !== null &&
      !accessibleSpaceIds.includes(parsed.data.spaceId)
    ) {
      res.json({
        data: {
          hits: [],
          total: 0,
          page: parsed.data.page,
          size: parsed.data.size,
        },
      });
      return;
    }

    const results = await searchDocuments(db, parsed.data as SearchQuery, {
      orgId,
      userId,
      groupIds,
      isAdmin: userRole === "admin",
      canSearch,
    });

    res.json({ data: results });
  });

  router.get("/search/suggest", async (req, res) => {
    const { orgId, userId, userRole, groupIds } = req.tenant;
    const q = z.string().min(1).max(200).safeParse(req.query["q"]);
    if (!q.success) {
      res.json({ data: [] });
      return;
    }

    const spaceId = z.string().uuid().optional().safeParse(req.query["spaceId"]);
    const filterSpaceId = spaceId.success ? spaceId.data : undefined;

    const canSearch = await canRunSearch({ db, userRole, userId, groupIds, orgId });

    const suggestions = await suggestDocumentTitles(
      db,
      q.data,
      {
        orgId,
        userId,
        groupIds,
        isAdmin: userRole === "admin",
        canSearch,
      },
      filterSpaceId,
    );

    res.json({ data: suggestions });
  });

  return router;
}
