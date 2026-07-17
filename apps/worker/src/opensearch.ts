import { Client } from "@opensearch-project/opensearch";

export function createOpenSearchClient(url: string): Client {
  return new Client({ node: url });
}

export const INDEX_NAME = "wiki-documents";

export const INDEX_MAPPING = {
  mappings: {
    properties: {
      org_id: { type: "keyword" },
      document_id: { type: "keyword" },
      space_id: { type: "keyword" },
      type: { type: "keyword" },
      is_editable: { type: "boolean" },
      title: {
        type: "text",
        analyzer: "english",
        fields: { keyword: { type: "keyword" } },
      },
      body: { type: "text", analyzer: "english" },
      tags: { type: "keyword" },
      owner_id: { type: "keyword" },
      updated_at: { type: "date" },
      view_count: { type: "integer" },
      acl_group_ids: { type: "keyword" },
      acl_user_ids: { type: "keyword" },
      // Phase 2 AI search — null until embeddings are generated
      content_embedding: {
        type: "knn_vector",
        dimension: 1536,
        method: {
          name: "hnsw",
          space_type: "cosinesimil",
          engine: "lucene",
        },
      },
    },
  },
  settings: {
    "index.knn": true,
    number_of_shards: 1,
    number_of_replicas: 1,
  },
};

export async function ensureIndex(client: Client): Promise<void> {
  const exists = await client.indices.exists({ index: INDEX_NAME });
  if (!exists.body) {
    await client.indices.create({ index: INDEX_NAME, body: INDEX_MAPPING });
  }
}
