import type { Client } from "@opensearch-project/opensearch";
import type { SearchQuery, SearchResponse } from "@wiki/types";

const INDEX = "wiki-documents";

export class SearchService {
  constructor(private os: Client) {}

  async search(
    query: SearchQuery,
    orgId: string,
    userGroupIds: string[],
    userId: string,
  ): Promise<SearchResponse> {
    const page = query.page ?? 1;
    const size = Math.min(query.size ?? 20, 100);
    const from = (page - 1) * size;

    const body = this.buildQuery(query, orgId, userGroupIds, userId);

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

  async suggest(q: string, orgId: string, userGroupIds: string[], userId?: string): Promise<string[]> {
    if (!q.trim()) return [];

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
            filter: [
              { term: { org_id: orgId } },
              {
                bool: {
                  should: [
                    ...(userGroupIds.length ? [{ terms: { acl_group_ids: userGroupIds } }] : []),
                    ...(userId ? [{ term: { acl_user_ids: userId } }] : []),
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
          },
        },
      },
    });

    return result.body.hits.hits.map(
      (h: Record<string, unknown>) => ((h["_source"] as Record<string, unknown>)["title"] as string),
    );
  }

  private buildQuery(
    query: SearchQuery,
    orgId: string,
    userGroupIds: string[],
    userId: string,
  ) {
    const filters: unknown[] = [
      { term: { org_id: orgId } },
      // ACL filter: document must grant access to at least one of the user's groups, or the user directly
      {
        bool: {
          should: [
            ...(userGroupIds.length ? [{ terms: { acl_group_ids: userGroupIds } }] : []),
            { term: { acl_user_ids: userId } },
          ],
          minimum_should_match: 1,
        },
      },
    ];

    if (query.spaceId) filters.push({ term: { space_id: query.spaceId } });
    if (query.type) filters.push({ term: { type: query.type } });
    if (query.authorId) filters.push({ term: { owner_id: query.authorId } });
    if (query.tags?.length) filters.push({ terms: { tags: query.tags } });
    if (query.from || query.to) {
      filters.push({
        range: {
          updated_at: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        },
      });
    }

    return {
      query: {
        bool: {
          must: [
            {
              multi_match: {
                query: query.q,
                fields: ["title^3", "body", "tags^2"],
                type: "best_fields",
                fuzziness: "AUTO",
              },
            },
          ],
          filter: filters,
          should: [
            // SR-4: recency boost
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
        },
      },
      highlight: {
        pre_tags: ["<mark>"],
        post_tags: ["</mark>"],
        fields: {
          title: { number_of_fragments: 1, fragment_size: 100 },
          body: { number_of_fragments: 3, fragment_size: 200 },
        },
      },
      sort: [{ _score: "desc" }, { updated_at: "desc" }],
    };
  }
}
