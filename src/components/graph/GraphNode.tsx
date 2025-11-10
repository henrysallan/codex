import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh } from 'three';
import type { ContentItem } from '../../types';

interface GraphNodeProps {
  item: ContentItem;
}

export default function GraphNode({ item }: GraphNodeProps) {
  const meshRef = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);

  // Physics simulation
  useFrame((state, delta) => {
    if (!meshRef.current) return;

    // TODO: Implement physics forces
    // For now, just keep nodes at their UMAP positions
    meshRef.current.position.set(
      item.umap_coords.x,
      item.umap_coords.y,
      item.umap_coords.z
    );
  });

  const handleClick = () => {
    console.log('Clicked item:', item.title);
    // TODO: Implement camera zoom and sidebar
  };

  // Color by content type
  const getColor = () => {
    switch (item.type) {
      case 'image':
        return '#FF6B6B';
      case 'text':
        return '#4ECDC4';
      case 'pdf':
        return '#45B7D1';
      case 'link':
        return '#FFA07A';
      default:
        return '#95E1D3';
    }
  };

  return (
    <mesh
      ref={meshRef}
      onClick={handleClick}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      scale={hovered ? 1.5 : 1}
    >
      <sphereGeometry args={[0.5, 16, 16]} />
      <meshStandardMaterial
        color={getColor()}
        emissive={hovered ? getColor() : '#000000'}
        emissiveIntensity={hovered ? 0.5 : 0}
      />
    </mesh>
  );
}
