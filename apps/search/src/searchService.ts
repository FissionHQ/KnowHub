import type { Client } from "@opensearch-project/opensearch";
import type { SearchQuery, SearchResponse } from "@wiki/types";

const INDEX = "wiki-documents";

/** Fuzzy layer: title-only typo tolerance; prefix_length avoids unrelated body tokens. */
const FUZZY_TITLE = {
  fuzziness: "AUTO" as const,
  prefix_length: 2,
  max_expansions: 25,
};

/** null = admin (all spaces in org); [] = no accessible spaces */
export type AccessibleSpaces = string[] | null;

export class SearchService {
  constructor(private os: Client) {}

  async search(
    query: SearchQuery,
    orgId: string,
    userId: string,
    userGroupIds: string[],
    accessibleSpaceIds: AccessibleSpaces,
    canSearch: boolean,
  ): Promise<SearchResponse> {
    const page = query.page ?? 1;
    const size = Math.min(query.size ?? 20, 100);
    const from = (page - 1) * size;

    if (!canSearch) {
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

    const body = this.buildQuery(query, orgId, userId, userGroupIds, accessibleSpaceIds);

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
        preview: (src["preview"] as string | null) ?? undefined,
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
    userId: string,
    userGroupIds: string[],
    accessibleSpaceIds: AccessibleSpaces,
    canSearch: boolean,
    spaceId?: string,
  ): Promise<string[]> {
    if (!q.trim()) return [];
    if (!canSearch) return [];

    const filters = this.buildAclFilters(orgId, userId, userGroupIds, accessibleSpaceIds);
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
                    { match_phrase_prefix: { title: { query: q, max_expansions: 25, boost: 4 } } },
                    { match: { title: { query: q, boost: 2 } } },
                    ...(q.trim().length >= 4
                      ? [{ match: { title: { query: q, boost: 1, ...FUZZY_TITLE } } }]
                      : []),
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
            filter: filters,
          },
        },
        collapse: { field: "document_id" },
      },
    });

    return result.body.hits.hits.map(
      (h: Record<string, unknown>) => ((h["_source"] as Record<string, unknown>)["title"] as string),
    );
  }

  private buildAclFilters(
    orgId: string,
    userId: string,
    userGroupIds: string[],
    accessibleSpaceIds: AccessibleSpaces,
  ): unknown[] {
    const filters: unknown[] = [{ term: { org_id: orgId } }];

    if (accessibleSpaceIds === null) return filters;

    const aclShould: unknown[] = [{ term: { acl_user_ids: userId } }];
    if (userGroupIds.length) {
      aclShould.push({ terms: { acl_group_ids: userGroupIds } });
    }

    filters.push({
      bool: {
        should: aclShould,
        minimum_should_match: 1,
      },
    });

    return filters;
  }

  private buildQuery(
    query: SearchQuery,
    orgId: string,
    userId: string,
    userGroupIds: string[],
    accessibleSpaceIds: AccessibleSpaces,
  ) {
    const filters = this.buildAclFilters(orgId, userId, userGroupIds, accessibleSpaceIds);

    if (query.spaceId) filters.push({ term: { space_id: query.spaceId } });
    if (query.type === "page") {
      filters.push({
        bool: {
          should: [
            { term: { type: "page" } },
            { bool: { must: [{ term: { type: "pdf" } }, { term: { is_editable: true } }] } },
          ],
          minimum_should_match: 1,
        },
      });
    } else if (query.type) {
      filters.push({ term: { type: query.type } });
    }
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
    const textMust = textQuery ? this.buildTextMust(textQuery) : { match_all: {} };

    const rankedQuery = {
      function_score: {
        query: {
          bool: {
            must: [textMust],
            filter: filters,
          },
        },
        functions: [
          {
            gauss: {
              updated_at: {
                origin: "now",
                scale: "30d",
                offset: "7d",
                decay: 0.5,
              },
            },
            weight: 1.5,
          },
          {
            field_value_factor: {
              field: "view_count",
              modifier: "log1p",
              factor: 0.25,
              missing: 0,
            },
          },
        ],
        score_mode: "sum",
        boost_mode: "multiply",
      },
    };

    return {
      query: rankedQuery,
      collapse: {
        field: "document_id",
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
      sort: [{ _score: "desc" }, { updated_at: "desc" }],
    };
  }

  /**
   * Full-text search aligned with suggest:
   * - Title prefix + phrase + token match (including while typing)
   * - Body/tags full-text (no fuzzy on body — avoids "wel" → "web" noise)
   * - Title-only fuzzy for typos on queries ≥ 4 chars
   */
  private buildTextMust(textQuery: string): unknown {
    const should: unknown[] = [
      { match_phrase: { title: { query: textQuery, boost: 10 } } },
      { match_phrase_prefix: { title: { query: textQuery, boost: 8, max_expansions: 25 } } },
      { match: { title: { query: textQuery, boost: 6 } } },
      { match_phrase: { body: { query: textQuery, boost: 2 } } },
      { match: { body: { query: textQuery, boost: 1 } } },
      { match: { tags: { query: textQuery, boost: 2 } } },
    ];

    if (textQuery.length >= 4) {
      should.push({ match: { title: { query: textQuery, boost: 2, ...FUZZY_TITLE } } });
    }

    return {
      bool: {
        should,
        minimum_should_match: 1,
      },
    };
  }
}
