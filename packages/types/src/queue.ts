// SQS message payloads

export interface PdfProcessingMessage {
  type: "PDF_PROCESSING";
  attachmentId: string;
  documentId: string;
  orgId: string;
  quarantineKey: string;
  originalName: string;
  sizeBytes: number;
}

export interface SearchIndexMessage {
  type: "SEARCH_INDEX";
  documentId: string;
  orgId: string;
  operation: "upsert" | "delete";
}
