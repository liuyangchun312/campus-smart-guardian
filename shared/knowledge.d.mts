export type EvidenceSource = {
  id: string;
  title: string;
  source: string;
  url: string;
  excerpt: string;
  applicability: string;
  kind: "policy" | "safety" | "method";
  topics: readonly string[];
  /** BM25 lexical relevance within the curated corpus; never a confidence. */
  score?: number;
};
export const knowledgeSources: readonly EvidenceSource[];
export function retrieveEvidence(query: string, options?: { limit?: number }): EvidenceSource[];
export function formatEvidenceContext(sources: readonly EvidenceSource[]): string;
