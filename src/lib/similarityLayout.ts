import type { ContentItem } from '../types';
import { getItemTags, calculateTagSimilarity } from './tagSimilarity';
import { cosineSimilarity } from './embeddings';

/**
 * Calculate semantic similarity between two items using embeddings
 */
function calculateEmbeddingSimilarity(itemA: ContentItem, itemB: ContentItem): number {
  if (!itemA.embedding || !itemB.embedding || 
      itemA.embedding.length === 0 || itemB.embedding.length === 0) {
    return 0;
  }
  return cosineSimilarity(itemA.embedding, itemB.embedding);
}

/**
 * Generate 2D coordinates for items based on collection membership and tag similarity
 * Collections are positioned in a tight spiral, items cluster within their collection
 */
export function generateSimilarityBasedLayout(
  items: ContentItem[],
): { x: number; y: number }[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [{ x: 0, y: 0 }];

  // Group items by PRIMARY collection (collectionId field)
  // This ensures each item only appears once, even if in multiple collections
  const collectionMap = new Map<string, ContentItem[]>();
  const noCollection: ContentItem[] = [];

  for (const item of items) {
    // Use collectionId as the primary collection for positioning
    const primaryCollection = item.collectionId;

    if (!primaryCollection) {
      noCollection.push(item);
    } else {
      if (!collectionMap.has(primaryCollection)) {
        collectionMap.set(primaryCollection, []);
      }
      collectionMap.get(primaryCollection)!.push(item);
    }
  }

  const collections = Array.from(collectionMap.entries());
  const positions = new Map<string, { x: number; y: number }>();

  // Position collections in a tight spiral pattern instead of a large circle
  // This keeps everything closer to the center while still separating collections
  const baseRadius = 15; // Much smaller base radius
  const radiusGrowth = 8; // Gradual spiral outward
  
  collections.forEach(([collectionId, _], index) => {
    // Spiral formula: radius grows slowly, angle increases
    const angle = index * 2.4; // Golden angle for nice distribution
    const radius = baseRadius + Math.sqrt(index) * radiusGrowth;
    const cx = Math.cos(angle) * radius;
    const cy = Math.sin(angle) * radius;

    // Now position items within this collection based on tag similarity
    const collectionItems = collectionMap.get(collectionId)!;;
    
    if (collectionItems.length === 1) {
      // Single item - place at collection center
      positions.set(collectionItems[0].id, { x: cx, y: cy });
    } else {
      // Multiple items - cluster by tag similarity using mini force-directed layout
      // Smaller cluster radius keeps things tight
      const clusterRadius = Math.min(12, 4 + collectionItems.length * 0.3);
      
      // Initialize positions in small cluster around collection center
      const clusterPositions = collectionItems.map(() => ({
        x: cx + (Math.random() - 0.5) * clusterRadius * 0.5,
        y: cy + (Math.random() - 0.5) * clusterRadius * 0.5,
        vx: 0,
        vy: 0,
      }));

      // Run mini simulation for tag-based clustering within collection
      for (let iter = 0; iter < 100; iter++) {
        const forces = clusterPositions.map(() => ({ fx: 0, fy: 0 }));

        for (let i = 0; i < collectionItems.length; i++) {
          for (let j = i + 1; j < collectionItems.length; j++) {
            const dx = clusterPositions[j].x - clusterPositions[i].x;
            const dy = clusterPositions[j].y - clusterPositions[i].y;
            const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;

            // Combine tag similarity and embedding similarity for attraction
            const tagsA = getItemTags(collectionItems[i]);
            const tagsB = getItemTags(collectionItems[j]);
            const tagSim = calculateTagSimilarity(tagsA, tagsB);
            const embeddingSim = calculateEmbeddingSimilarity(collectionItems[i], collectionItems[j]);
            
            // Weight embeddings more heavily (70%) than tags (30%)
            const combinedSim = embeddingSim * 0.7 + tagSim * 0.3;

            if (combinedSim > 0.15) {
              const attraction = combinedSim * 0.4;
              const fx = (dx / dist) * attraction * dist;
              const fy = (dy / dist) * attraction * dist;
              forces[i].fx += fx;
              forces[i].fy += fy;
              forces[j].fx -= fx;
              forces[j].fy -= fy;
            }

            // Repulsion to prevent overlap
            if (dist < 5) {
              const repulsion = 2.0 / (dist * dist);
              const fx = (dx / dist) * repulsion;
              const fy = (dy / dist) * repulsion;
              forces[i].fx -= fx;
              forces[i].fy -= fy;
              forces[j].fx += fx;
              forces[j].fy += fy;
            }
          }

          // Gentle pull toward collection center to keep cluster cohesive
          const toCenterX = cx - clusterPositions[i].x;
          const toCenterY = cy - clusterPositions[i].y;
          const centerDist = Math.sqrt(toCenterX * toCenterX + toCenterY * toCenterY);
          if (centerDist > clusterRadius) {
            forces[i].fx += (toCenterX / centerDist) * 0.5;
            forces[i].fy += (toCenterY / centerDist) * 0.5;
          }
        }

        // Apply forces
        const damping = 0.7;
        for (let i = 0; i < clusterPositions.length; i++) {
          clusterPositions[i].vx = (clusterPositions[i].vx + forces[i].fx * 0.3) * damping;
          clusterPositions[i].vy = (clusterPositions[i].vy + forces[i].fy * 0.3) * damping;
          clusterPositions[i].x += clusterPositions[i].vx;
          clusterPositions[i].y += clusterPositions[i].vy;
        }
      }

      // Store final positions
      collectionItems.forEach((item, i) => {
        positions.set(item.id, {
          x: clusterPositions[i].x,
          y: clusterPositions[i].y,
        });
      });
    }
  });

  // Handle items without collection - place at center with tag-based clustering
  if (noCollection.length > 0) {
    noCollection.forEach(item => {
      positions.set(item.id, {
        x: (Math.random() - 0.5) * 8, // Tighter spacing at center
        y: (Math.random() - 0.5) * 8,
      });
    });
  }

  // Return positions in same order as input items
  return items.map(item => positions.get(item.id) || { x: 0, y: 0 });
}

/**
 * Normalize coordinates to fit within a specified range
 */
export function normalizeCoordinates(
  coords: { x: number; y: number }[],
  maxRange: number = 80
): { x: number; y: number }[] {
  if (coords.length === 0) return [];

  // Find bounds
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const coord of coords) {
    minX = Math.min(minX, coord.x);
    maxX = Math.max(maxX, coord.x);
    minY = Math.min(minY, coord.y);
    maxY = Math.max(maxY, coord.y);
  }

  // Calculate scale to fit in range
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const scale = maxRange / Math.max(rangeX, rangeY);

  // Center and scale
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return coords.map(coord => ({
    x: (coord.x - centerX) * scale,
    y: (coord.y - centerY) * scale,
  }));
}
