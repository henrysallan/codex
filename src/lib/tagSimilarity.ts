import type { ContentItem } from '../types';

/**
 * Configurable weights for similarity calculation
 */
export interface SimilarityWeights {
  tags: number;         // Weight for tag similarity (0-1)
  collection: number;   // Weight for collection membership (0-1)
  uploadDate: number;   // Weight for upload date proximity (0-1)
  color: number;        // Weight for color similarity (0-1)
}

/**
 * Default weights for similarity calculation
 * Total should sum to 1.0 for normalized scores
 */
export const DEFAULT_WEIGHTS: SimilarityWeights = {
  tags: 0.3,
  collection: 0.5,
  uploadDate: 0.1,
  color: 0.1,
};

/**
 * Calculate Jaccard similarity between two sets of tags
 * Returns a value between 0 (no overlap) and 1 (identical tags)
 */
export function calculateTagSimilarity(tagsA: string[], tagsB: string[]): number {
  if (tagsA.length === 0 || tagsB.length === 0) {
    return 0;
  }

  // Normalize tags to lowercase for comparison
  const setA = new Set(tagsA.map(t => t.toLowerCase()));
  const setB = new Set(tagsB.map(t => t.toLowerCase()));

  // Calculate intersection
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  
  // Calculate union
  const union = new Set([...setA, ...setB]);

  // Jaccard similarity: |A ∩ B| / |A ∪ B|
  return intersection.size / union.size;
}

/**
 * Calculate collection similarity between two items
 * Returns 1 if they share any collection, 0 otherwise
 */
export function calculateCollectionSimilarity(itemA: ContentItem, itemB: ContentItem): number {
  const collectionsA = new Set([
    ...(itemA.collection_ids || []),
    ...(itemA.collectionId ? [itemA.collectionId] : []),
  ]);
  
  const collectionsB = new Set([
    ...(itemB.collection_ids || []),
    ...(itemB.collectionId ? [itemB.collectionId] : []),
  ]);

  if (collectionsA.size === 0 || collectionsB.size === 0) {
    return 0;
  }

  // Check if any collections overlap
  const hasOverlap = [...collectionsA].some(c => collectionsB.has(c));
  return hasOverlap ? 1 : 0;
}

/**
 * Calculate upload date similarity between two items
 * Returns a value between 0 and 1 based on how close the upload dates are
 * Items uploaded within a day get 1, scaling down to 0 over 30 days
 */
export function calculateDateSimilarity(itemA: ContentItem, itemB: ContentItem): number {
  if (!itemA.created_at || !itemB.created_at) {
    return 0;
  }

  try {
    const dateA = itemA.created_at.toDate();
    const dateB = itemB.created_at.toDate();
    
    const diffMs = Math.abs(dateA.getTime() - dateB.getTime());
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    
    // Linear decay from 1 (same day) to 0 (30+ days apart)
    const maxDays = 30;
    return Math.max(0, 1 - (diffDays / maxDays));
  } catch {
    return 0;
  }
}

/**
 * Calculate color similarity between two items
 * Uses simple Euclidean distance in RGB space
 * Returns a value between 0 (very different) and 1 (identical)
 */
export function calculateColorSimilarity(itemA: ContentItem, itemB: ContentItem): number {
  if (!itemA.averageColor || !itemB.averageColor) {
    return 0;
  }

  const [r1, g1, b1] = itemA.averageColor;
  const [r2, g2, b2] = itemB.averageColor;

  // Euclidean distance in RGB space (max distance is sqrt(3 * 255^2) ≈ 441)
  const distance = Math.sqrt(
    Math.pow(r1 - r2, 2) +
    Math.pow(g1 - g2, 2) +
    Math.pow(b1 - b2, 2)
  );

  // Convert to similarity (0 = far apart, 1 = identical)
  const maxDistance = Math.sqrt(3 * Math.pow(255, 2));
  return 1 - (distance / maxDistance);
}

/**
 * Get all tags from an item (combining AI tags and user tags)
 */
export function getItemTags(item: ContentItem): string[] {
  const tags = [
    ...(item.aiTags || []),
    ...(item.tags || []),
  ];
  return tags;
}

/**
 * Calculate similarity score between two items based on their tags
 * @deprecated Use calculateWeightedSimilarity for more sophisticated similarity
 */
export function calculateItemSimilarity(itemA: ContentItem, itemB: ContentItem): number {
  const tagsA = getItemTags(itemA);
  const tagsB = getItemTags(itemB);
  
  return calculateTagSimilarity(tagsA, tagsB);
}

/**
 * Calculate weighted similarity between two items
 * Combines multiple factors with configurable weights
 */
export function calculateWeightedSimilarity(
  itemA: ContentItem,
  itemB: ContentItem,
  weights: SimilarityWeights = DEFAULT_WEIGHTS
): number {
  const tagsA = getItemTags(itemA);
  const tagsB = getItemTags(itemB);

  // Calculate individual similarity components
  const tagSim = calculateTagSimilarity(tagsA, tagsB);
  const collectionSim = calculateCollectionSimilarity(itemA, itemB);
  const dateSim = calculateDateSimilarity(itemA, itemB);
  const colorSim = calculateColorSimilarity(itemA, itemB);

  // Weighted combination
  const score = 
    (tagSim * weights.tags) +
    (collectionSim * weights.collection) +
    (dateSim * weights.uploadDate) +
    (colorSim * weights.color);

  return score;
}

