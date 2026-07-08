// OpenSearch index document shape — single source of truth

export interface SearchIndexDocument {
  org_id: string;
  document_id: string;
  space_id: string;
  type: "page" | "pdf";
  title: string;
  body: string;
  tags: string[];
  owner_id: string;
  updated_at: string;
  acl_group_ids: string[];
  acl_user_ids: string[];
  // Reserved for Phase 2 AI search — null until embeddings are generated
  content_embedding: number[] | null;
}
