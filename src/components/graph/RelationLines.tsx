import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { calculateWeightedSimilarity, DEFAULT_WEIGHTS } from '../../lib/tagSimilarity';
import type { ContentItem } from '../../types';
import type { SimilarityWeights } from '../../lib/tagSimilarity';

interface RelationLinesProps {
  items: ContentItem[];
  similarityThreshold?: number; // Only draw lines above this threshold (0-1)
  physicsPositions?: Map<string, { x: number; y: number }>;
  similarityWeights?: SimilarityWeights; // Optional custom weights
}

interface ConnectionInfo {
  itemAId: string;
  itemBId: string;
  similarity: number;
}

// Individual line component that updates its position every frame
function LiveLine({
  itemAId,
  itemBId,
  similarity,
  similarityThreshold,
  physicsPositions,
  itemsMap,
}: {
  itemAId: string;
  itemBId: string;
  similarity: number;
  similarityThreshold: number;
  physicsPositions?: Map<string, { x: number; y: number }>;
  itemsMap: Map<string, ContentItem>;
}) {
  const lineRef = useRef<THREE.Line>(null);
  
  // Get initial positions for fallback
  const itemA = itemsMap.get(itemAId);
  const itemB = itemsMap.get(itemBId);
  const initialPosA = physicsPositions?.get(itemAId) || itemA?.umap_coords;
  const initialPosB = physicsPositions?.get(itemBId) || itemB?.umap_coords;

  // Opacity based on similarity strength
  const opacity = 0.2 + (similarity - similarityThreshold) * 1.2;

  // Create geometry and material manually
  useEffect(() => {
    if (!lineRef.current || !initialPosA || !initialPosB) return;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array([
      initialPosA.x, initialPosA.y, -0.1,
      initialPosB.x, initialPosB.y, -0.1,
    ]);
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const material = new THREE.LineBasicMaterial({
      color: 0x999999,
      transparent: true,
      opacity: Math.min(opacity, 0.5),
    });

    lineRef.current.geometry = geometry;
    lineRef.current.material = material;

    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [initialPosA, initialPosB, opacity]);

  // Update line positions every frame by directly modifying geometry
  useFrame(() => {
    if (!lineRef.current) return;

    const itemA = itemsMap.get(itemAId);
    const itemB = itemsMap.get(itemBId);

    if (!itemA || !itemB) return;

    // Get live positions
    const posA = physicsPositions?.get(itemAId) || itemA.umap_coords;
    const posB = physicsPositions?.get(itemBId) || itemB.umap_coords;

    if (!posA || !posB) return;

    // Directly update geometry positions
    const positions = lineRef.current.geometry.attributes.position.array as Float32Array;
    
    positions[0] = posA.x;
    positions[1] = posA.y;
    positions[2] = -0.1;
    positions[3] = posB.x;
    positions[4] = posB.y;
    positions[5] = -0.1;
    
    lineRef.current.geometry.attributes.position.needsUpdate = true;
  });

  if (!initialPosA || !initialPosB) return null;

  return <primitive object={new THREE.Line()} ref={lineRef} />;
}

export default function RelationLines({ 
  items, 
  similarityThreshold = 0.3, 
  physicsPositions,
  similarityWeights = DEFAULT_WEIGHTS,
}: RelationLinesProps) {
  // Create items map for O(1) lookups
  const itemsMap = useMemo(() => {
    const map = new Map<string, ContentItem>();
    items.forEach(item => map.set(item.id, item));
    return map;
  }, [items]);

  // Calculate which items should be connected (only recalculate when items change)
  const connectionInfo = useMemo(() => {
    const result: ConnectionInfo[] = [];

    console.log(`RelationLines: Processing ${items.length} items`);

    // Compare each pair of items
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const itemA = items[i];
        const itemB = items[j];

        // Calculate weighted similarity
        const similarity = calculateWeightedSimilarity(itemA, itemB, similarityWeights);

        // Only create connection if above threshold
        if (similarity >= similarityThreshold) {
          result.push({
            itemAId: itemA.id,
            itemBId: itemB.id,
            similarity,
          });
        }
      }
    }

    console.log(`Found ${result.length} connections above threshold ${similarityThreshold}`);
    console.log(`Using similarity weights:`, similarityWeights);
    return result;
  }, [items, similarityThreshold, similarityWeights]);

  return (
    <group>
      {connectionInfo.map((info) => (
        <LiveLine
          key={`${info.itemAId}-${info.itemBId}`}
          itemAId={info.itemAId}
          itemBId={info.itemBId}
          similarity={info.similarity}
          similarityThreshold={similarityThreshold}
          physicsPositions={physicsPositions}
          itemsMap={itemsMap}
        />
      ))}
    </group>
  );
}
