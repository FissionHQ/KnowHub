import type { Client } from "@opensearch-project/opensearch";
import type { SearchQuery, SearchResponse } from "@wiki/types";

const INDEX = "wiki-documents";

/** null = admin (all spaces in org); [] = no accessible spaces */
export type AccessibleSpaces = string[] | null;

export class SearchService {
  constructor(private os: Client) {}

  async search(
    query: SearchQuery,
    orgId: string,
    userGroupIds: string[],
    accessibleSpaceIds: AccessibleSpaces,
  ): Promise<SearchResponse> {
    const page = query.page ?? 1;
    const size = Math.min(query.size ?? 20, 100);
    const from = (page - 1) * size;

    if (!this.hasSearchAccess(userGroupIds, accessibleSpaceIds)) {
      return { hits: [], total: 0, page, size };
    }

    if (
      query.spaceId &&
      accessibleSpaceIds !== null &&
      !accessibleSpaceIds.includes(query.spaceId)
    ) {
      return { hits: [], total: 0, page, size };
    }

    const hasQuery = Boolean(query.q?.trim());
    const hasFilters = Boolean(
      query.spaceId ||
        query.type ||
        query.authorId ||
        query.tags?.length ||
        query.from ||
        query.to,
    );
    if (!hasQuery && !hasFilters) {
      return { hits: [], total: 0, page, size };
    }

    const body = this.buildQuery(query, orgId, userGroupIds, accessibleSpaceIds);

    const result = await this.os.search({
      index: INDEX,
      body,
      from,
      size,
    });

    const hits = result.body.hits.hits.map((h: Record<string, unknown>) => {
      const src = h["_source"] as Record<string, unknown>;
      const highlight = (h["highlight"] as Record<string, unknown[]> | undefined) ?? {};
      return {
        documentId: src["document_id"] as string,
        spaceId: src["space_id"] as string,
        type: src["type"] as string,
        title: src["title"] as string,
        highlight: {
          title: (highlight["title"] as string[] | undefined) ?? [],
          body: (highlight["body"] as string[] | undefined) ?? [],
        },
        score: h["_score"] as number,
        updatedAt: src["updated_at"] as string,
      };
    });

    return {
      hits,
      total: (result.body.hits.total as { value: number }).value,
      page,
      size,
    };
  }

  async suggest(
    q: string,
    orgId: string,
    userGroupIds: string[],
    accessibleSpaceIds: AccessibleSpaces,
    spaceId?: string,
  ): Promise<string[]> {
    if (!q.trim()) return [];
    if (!this.hasSearchAccess(userGroupIds, accessibleSpaceIds)) return [];

    if (
      spaceId &&
      accessibleSpaceIds !== null &&
      !accessibleSpaceIds.includes(spaceId)
    ) {
      return [];
    }

    const filters = this.buildAclFilters(orgId, userGroupIds, accessibleSpaceIds);
    if (spaceId) filters.push({ term: { space_id: spaceId } });
    const result = await this.os.search({
      index: INDEX,
      body: {
        _source: ["title"],
        size: 7,
        query: {
          bool: {
            must: [
              {
                bool: {
                  should: [
                    { match_phrase_prefix: { title: { query: q, max_expansions: 20, boost: 3 } } },
                    { match: { title: { query: q, fuzziness: "AUTO" } } },
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
            filter: filters,
          },
        },
      },
    });

    return result.body.hits.hits.map(
      (h: Record<string, unknown>) => ((h["_source"] as Record<string, unknown>)["title"] as string),
    );
  }

  /** Mirrors API: space access via groups first; admin bypasses. */
  private hasSearchAccess(
    userGroupIds: string[],
    accessibleSpaceIds: AccessibleSpaces,
  ): boolean {
    if (accessibleSpaceIds === null) return true;
    return userGroupIds.length > 0 && accessibleSpaceIds.length > 0;
  }

  private buildAclFilters(
    orgId: string,
    userGroupIds: string[],
    accessibleSpaceIds: AccessibleSpaces,
  ): unknown[] {
    const filters: unknown[] = [{ term: { org_id: orgId } }];

    if (accessibleSpaceIds === null) return filters;

    filters.push({ terms: { space_id: accessibleSpaceIds } });
    filters.push({ terms: { acl_group_ids: userGroupIds } });

    return filters;
  }

  private buildQuery(
    query: SearchQuery,
    orgId: string,
    userGroupIds: string[],
    accessibleSpaceIds: AccessibleSpaces,
  ) {
    const filters = this.buildAclFilters(orgId, userGroupIds, accessibleSpaceIds);

    if (query.spaceId) filters.push({ term: { space_id: query.spaceId } });
    if (query.type) filters.push({ term: { type: query.type } });
    if (query.authorId) filters.push({ term: { owner_id: query.authorId } });
    if (query.tags?.length) filters.push({ terms: { tags: query.tags } });
    if (query.from || query.to) {
      filters.push({
        range: {
          updated_at: {
            ...(query.from
              ? { gte: query.from.length === 10 ? `${query.from}T00:00:00.000Z` : query.from }
              : {}),
            ...(query.to
              ? { lte: query.to.length === 10 ? `${query.to}T23:59:59.999Z` : query.to }
              : {}),
          },
        },
      });
    }

    const textQuery = query.q?.trim() ?? "";
    const must = textQuery
      ? [
          {
            multi_match: {
              query: textQuery,
              fields: ["title^3", "body", "tags^2"],
              type: "best_fields",
              fuzziness: "AUTO",
            },
          },
        ]
      : [{ match_all: {} }];

    return {
      query: {
        bool: {
          must,
          filter: filters,
          ...(textQuery
            ? {
                should: [
                  {
                    range: {
                      updated_at: {
                        gte: "now-7d",
                        boost: 2,
                      },
                    },
                  },
                  {
                    range: {
                      updated_at: {
                        gte: "now-30d",
                        boost: 1,
                      },
                    },
                  },
                ],
              }
            : {}),
        },
      },
      highlight: {
        pre_tags: ["<mark>"],
        post_tags: ["</mark>"],
        fields: {
          title: { number_of_fragments: 1, fragment_size: 100 },
          body: { number_of_fragments: 3, fragment_size: 200 },
          tags: { number_of_fragments: 1, fragment_size: 80 },
        },
      },
      sort: textQuery
        ? [{ _score: "desc" }, { updated_at: "desc" }]
        : [{ updated_at: "desc" }],
    };
  }
}
