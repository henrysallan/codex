import type { ContentItem, SearchResult } from '../types';
import { generateEmbedding, cosineSimilarity } from './embeddings';

/**
 * Perform semantic search across content items
 * @param query - Search query text
 * @param items - Array of content items to search
 * @param limit - Maximum number of results to return
 * @returns Array of search results sorted by similarity
 */
export async function semanticSearch(
  query: string,
  items: ContentItem[],
  limit: number = 20
): Promise<SearchResult[]> {
  // Generate embedding for query
  const queryEmbedding = await generateEmbedding(query);

  // Calculate cosine similarity for each item
  const results = items
    .map((item) => ({
      item,
      similarity: cosineSimilarity(queryEmbedding, item.embedding),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return results;
}

/**
 * Text-based search in title, content, and OCR text
 */
export function textSearch(query: string, items: ContentItem[]): ContentItem[] {
  const lowerQuery = query.toLowerCase();
  return items.filter((item) => {
    return (
      item.title.toLowerCase().includes(lowerQuery) ||
      item.content?.toLowerCase().includes(lowerQuery) ||
      item.ocr_text?.toLowerCase().includes(lowerQuery)
    );
  });
}

/**
 * Search by tags
 */
export function tagSearch(query: string, items: ContentItem[]): ContentItem[] {
  const lowerQuery = query.toLowerCase();
  return items.filter((item) =>
    item.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
  );
}

/**
 * Hybrid search combining semantic, text, and tag search
 */
export async function hybridSearch(
  query: string,
  items: ContentItem[],
  limit: number = 20
): Promise<ContentItem[]> {
  const [semanticResults, textResults, tagResults] = await Promise.all([
    semanticSearch(query, items, limit),
    Promise.resolve(textSearch(query, items)),
    Promise.resolve(tagSearch(query, items)),
  ]);

  // Combine results with deduplication
  const seen = new Set<string>();
  const combined: ContentItem[] = [];

  // Add semantic results first (highest priority)
  semanticResults.forEach((result) => {
    if (!seen.has(result.item.id)) {
      seen.add(result.item.id);
      combined.push(result.item);
    }
  });

  // Add text search results
  textResults.forEach((item) => {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      combined.push(item);
    }
  });

  // Add tag search results
  tagResults.forEach((item) => {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      combined.push(item);
    }
  });

  return combined.slice(0, limit);
}
