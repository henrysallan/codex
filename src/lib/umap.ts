import UMAP from 'umap-js';
import { Vector3D } from '../types';

/**
 * Calculate UMAP coordinates for a batch of embeddings
 * @param embeddings - Array of embedding vectors
 * @returns Array of 3D coordinates
 */
export function calculateUMAPCoordinates(embeddings: number[][]): Vector3D[] {
  const umap = new UMAP({
    nComponents: 3, // 3D space
    nNeighbors: 15,
    minDist: 0.1,
  });

  const projection = umap.fit(embeddings);
  return projection.map(([x, y, z]: number[]) => ({ x, y, z }));
}

/**
 * Position a new embedding relative to existing items
 * Uses approximate nearest neighbor positioning
 */
export function positionNewEmbedding(
  newEmbedding: number[],
  existingEmbeddings: number[][],
  existingCoords: Vector3D[]
): Vector3D {
  // Find k-nearest neighbors
  const k = Math.min(5, existingEmbeddings.length);
  const neighbors = findKNearestNeighbors(
    newEmbedding,
    existingEmbeddings,
    k
  );

  // Average position of nearest neighbors
  const avgPosition = neighbors.reduce(
    (acc, idx) => ({
      x: acc.x + existingCoords[idx].x,
      y: acc.y + existingCoords[idx].y,
      z: acc.z + existingCoords[idx].z,
    }),
    { x: 0, y: 0, z: 0 }
  );

  return {
    x: avgPosition.x / k,
    y: avgPosition.y / k,
    z: avgPosition.z / k,
  };
}

function findKNearestNeighbors(
  target: number[],
  embeddings: number[][],
  k: number
): number[] {
  const distances = embeddings.map((emb, idx) => ({
    idx,
    dist: euclideanDistance(target, emb),
  }));

  distances.sort((a, b) => a.dist - b.dist);
  return distances.slice(0, k).map((d) => d.idx);
}

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}
