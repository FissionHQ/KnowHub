// OpenSearch index document shape — single source of truth

export interface SearchIndexDocument {
  org_id: string;
  document_id: string;
  space_id: string;
  type: "page" | "pdf";
  /** True for native pages and imported PDFs converted to editable HTML. */
  is_editable: boolean;
  title: string;
  body: string;
  tags: string[];
  owner_id: string;
  updated_at: string;
  /** Unique viewers (rows in recently_viewed); used for optional popularity ranking. */
  view_count: number;
  acl_group_ids: string[];
  acl_user_ids: string[];
  // Short text preview for listings/search results (PDF-9)
  preview: string | null;
  // Reserved for Phase 2 AI search — null until embeddings are generated
  content_embedding: number[] | null;
}
