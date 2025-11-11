import type { Vector3D } from '../types';

/**
 * Simple PCA implementation for dimensionality reduction
 * Reduces high-dimensional embeddings to 2D coordinates
 */
function pca2D(embeddings: number[][]): { x: number; y: number }[] {
  if (embeddings.length === 0) return [];
  if (embeddings.length === 1) return [{ x: 0, y: 0 }];

  const n = embeddings.length;
  const d = embeddings[0].length;

  // Center the data (subtract mean)
  const means = new Array(d).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < d; j++) {
      means[j] += embeddings[i][j];
    }
  }
  for (let j = 0; j < d; j++) {
    means[j] /= n;
  }

  const centered = embeddings.map(emb =>
    emb.map((val, j) => val - means[j])
  );

  // Use power iteration to find first 2 principal components
  // (simplified - not full SVD, but good enough for visualization)
  const pc1 = powerIteration(centered, d);
  const pc2 = powerIteration(centered, d, pc1);

  // Project data onto first 2 components
  const projected = centered.map(point => {
    const x = dotProduct(point, pc1);
    const y = dotProduct(point, pc2);
    return { x, y };
  });

  // Normalize to reasonable range for our scene (e.g., [-50, 50])
  return normalizeCoordinates(projected, 80);
}

/**
 * Power iteration to find a principal component
 */
function powerIteration(
  data: number[][],
  dimensions: number,
  orthogonalTo?: number[]
): number[] {
  // Start with random vector
  let vec = new Array(dimensions).fill(0).map(() => Math.random() - 0.5);
  
  // If we need to be orthogonal to another vector, project it out
  if (orthogonalTo) {
    const proj = dotProduct(vec, orthogonalTo);
    for (let i = 0; i < dimensions; i++) {
      vec[i] -= proj * orthogonalTo[i];
    }
  }

  // Normalize
  vec = normalize(vec);

  // Iterate to find dominant eigenvector
  for (let iter = 0; iter < 50; iter++) {
    const newVec = new Array(dimensions).fill(0);
    
    // Multiply by covariance matrix (X^T X v)
    for (const point of data) {
      const proj = dotProduct(point, vec);
      for (let i = 0; i < dimensions; i++) {
        newVec[i] += point[i] * proj;
      }
    }

    // Remove component orthogonal to constraint
    if (orthogonalTo) {
      const proj = dotProduct(newVec, orthogonalTo);
      for (let i = 0; i < dimensions; i++) {
        newVec[i] -= proj * orthogonalTo[i];
      }
    }

    vec = normalize(newVec);
  }

  return vec;
}

function dotProduct(a: number[], b: number[]): number {
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

function normalize(vec: number[]): number[] {
  const len = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
  return len > 0 ? vec.map(v => v / len) : vec;
}

function normalizeCoordinates(
  coords: { x: number; y: number }[],
  targetRange: number
): { x: number; y: number }[] {
  const xs = coords.map(c => c.x);
  const ys = coords.map(c => c.y);
  
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const scale = targetRange / Math.max(rangeX, rangeY);

  return coords.map(c => ({
    x: (c.x - minX - rangeX / 2) * scale,
    y: (c.y - minY - rangeY / 2) * scale,
  }));
}

/**
 * Calculate UMAP coordinates for a batch of embeddings
 * Uses PCA to reduce to 2D, returns as 3D coords (z=0) for compatibility
 * @param embeddings - Array of embedding vectors
 * @returns Array of 3D coordinates
 */
export function calculateUMAPCoordinates(embeddings: number[][]): Vector3D[] {
  const coords2D = pca2D(embeddings);
  return coords2D.map(c => ({ x: c.x, y: c.y, z: 0 }));
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

/**
 * Apply density-adaptive scaling to pack coordinates closer together
 * while giving dense regions more space
 * @param coords - Original 2D coordinates
 * @param densityRadius - Radius to calculate local density (default: 15)
 * @param compressionFactor - How much to compress sparse areas (0-1, default: 0.4)
 * @returns Scaled coordinates
 */
export function applyDensityAdaptiveScaling(
  coords: { x: number; y: number }[],
  densityRadius: number = 15,
  compressionFactor: number = 0.4
): { x: number; y: number }[] {
  if (coords.length === 0) return coords;
  if (coords.length === 1) return [{ x: 0, y: 0 }];

  // Calculate local density for each point
  const densities = coords.map((coord, i) => {
    let count = 0;
    for (let j = 0; j < coords.length; j++) {
      if (i === j) continue;
      const dx = coords[j].x - coord.x;
      const dy = coords[j].y - coord.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < densityRadius) {
        count++;
      }
    }
    return count;
  });

  // Normalize densities to [0, 1]
  const maxDensity = Math.max(...densities);
  const normalizedDensities = densities.map(d => maxDensity > 0 ? d / maxDensity : 0);

  // Apply scaling: high density areas keep their scale, low density areas get compressed
  const scaled = coords.map((coord, i) => {
    // Scale factor: 1 for dense areas, compressionFactor for sparse areas
    const scaleFactor = compressionFactor + (1 - compressionFactor) * normalizedDensities[i];

    return {
      x: coord.x * scaleFactor,
      y: coord.y * scaleFactor,
    };
  });

  // Re-center after scaling
  const meanX = scaled.reduce((sum, c) => sum + c.x, 0) / scaled.length;
  const meanY = scaled.reduce((sum, c) => sum + c.y, 0) / scaled.length;

  return scaled.map(c => ({
    x: c.x - meanX,
    y: c.y - meanY,
  }));
}
