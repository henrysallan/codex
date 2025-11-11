import { useRef, useMemo, Suspense } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { TextureLoader } from 'three';
import * as THREE from 'three';
import type { Mesh } from 'three';
import type { ContentItem } from '../../types';

// Custom shader for rounded corners
const roundedImageShader = {
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D map;
    uniform float radius;
    uniform float opacity;
    varying vec2 vUv;
    
    void main() {
      vec2 uv = vUv;
      
      // Calculate distance from corners for sharp rounded corners
      vec2 corner = abs(uv - 0.5) * 2.0;
      vec2 cornerDist = max(corner - (1.0 - radius * 2.0), 0.0);
      float dist = length(cornerDist);
      
      // Sharp cutoff instead of smooth
      if (dist > radius * 2.0) {
        discard;
      }
      
      vec4 texColor = texture2D(map, uv);
      gl_FragColor = vec4(texColor.rgb, texColor.a * opacity);
    }
  `
};

interface GraphNodeProps {
  item: ContentItem;
  index: number;
  totalItems: number;
  onFocus: (item: ContentItem, position: { x: number; y: number; z: number }) => void;
  isFocused: boolean;
  positionsMapRef: React.RefObject<Map<string, { x: number; y: number }>>;
  onDragStart?: (itemId: string, event: any) => void;
  isDragging?: boolean;
}

// Separate component for image sprite to handle texture loading
function ImageSprite({
  item,
  getPosition,
  handlePointerDown,
  isFocused,
  isDragging,
}: {
  item: ContentItem;
  getPosition: () => { x: number; y: number; z: number };
  handlePointerDown: (e: any) => void;
  isFocused: boolean;
  isDragging: boolean;
}) {
  const meshRef = useRef<Mesh>(null);

  // Load thumbnail by default, full-res when focused
  const imageUrl = isFocused && item.url ? item.url : item.thumbnail_url!;
  const texture = useLoader(TextureLoader, imageUrl);

  // Set proper color space for accurate color reproduction
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  // Calculate scale based on aspect ratio
  const aspectRatio = item.aspectRatio || 1;
  const baseSize = 5;
  const scaleX = aspectRatio > 1 ? baseSize : baseSize * aspectRatio;
  const scaleY = aspectRatio > 1 ? baseSize / aspectRatio : baseSize;

  // Create shader material with rounded corners
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: roundedImageShader.vertexShader,
      fragmentShader: roundedImageShader.fragmentShader,
      uniforms: {
        map: { value: texture },
        radius: { value: 0.08 }, // Small rounding (0-0.5, where 0.5 is circle)
        opacity: { value: isDragging ? 0.7 : 0.95 }
      },
      transparent: true,
      toneMapped: false,
    });
  }, [texture, isDragging]);

  // Update position every frame by calling getPosition (gets fresh data)
  useFrame(() => {
    if (meshRef.current) {
      const pos = getPosition();
      meshRef.current.position.set(pos.x, pos.y, pos.z);
      // Make the plane always face the camera
      meshRef.current.quaternion.copy((meshRef.current as any).parent.quaternion);
    }
  });

  return (
    <mesh
      ref={meshRef}
      onPointerDown={handlePointerDown}
      onPointerOver={() => { document.body.style.cursor = 'grab'; }}
      onPointerOut={() => { document.body.style.cursor = 'default'; }}
      scale={[scaleX, scaleY, 1]}
    >
      <planeGeometry args={[1, 1]} />
      <primitive object={shaderMaterial} attach="material" />
    </mesh>
  );
}

export default function GraphNode({
  item,
  index,
  totalItems,
  isFocused,
  positionsMapRef,
  onDragStart,
  isDragging = false,
  onFocus
}: GraphNodeProps) {
  const meshRef = useRef<Mesh>(null);

  // Calculate fallback position once (only used if no physics position)
  const fallbackPosition = useMemo(() => {
    // Use UMAP coords as static position if available
    if (item.umap_coords) {
      return {
        x: item.umap_coords.x,
        y: item.umap_coords.y,
        z: 0,
      };
    }

    // Fallback: arrange in a grid pattern on the XY plane
    const cols = Math.ceil(Math.sqrt(totalItems));
    const row = Math.floor(index / cols);
    const col = index % cols;
    const spacing = 8;
    const offsetX = -(cols * spacing) / 2;
    const offsetY = -(Math.ceil(totalItems / cols) * spacing) / 2;

    return {
      x: offsetX + col * spacing + (Math.random() - 0.5) * 2,
      y: offsetY + row * spacing + (Math.random() - 0.5) * 2,
      z: 0,
    };
  }, [item.id, item.umap_coords, index, totalItems]);

  // Get current position - read directly from the ref for real-time updates
  const getCurrentPosition = () => {
    const physicsPos = positionsMapRef.current?.get(item.id);
    if (physicsPos) {
      return { x: physicsPos.x, y: physicsPos.y, z: 0 };
    }
    return fallbackPosition;
  };

  // Update visual position every frame from latest physics state
  useFrame(() => {
    const pos = getCurrentPosition();
    if (meshRef.current) {
      meshRef.current.position.set(pos.x, pos.y, pos.z);
    }
  });

  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    
    // Always focus on click
    const pos = getCurrentPosition();
    onFocus(item, pos);
    
    // Handle drag if not shift-clicking
    if (onDragStart && !e.shiftKey) {
      onDragStart(item.id, e);
    }
  };

  // Color by content type (fallback for non-image items)
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

  // If we have a thumbnail, show it as a sprite (billboard)
  if (item.thumbnail_url && item.type === 'image') {
    return (
      <Suspense fallback={
        <mesh
          ref={meshRef}
          onPointerDown={handlePointerDown}
        >
          <sphereGeometry args={[0.5, 16, 16]} />
          <meshStandardMaterial
            color={getColor()}
            emissive={getColor()}
            emissiveIntensity={0.3}
          />
        </mesh>
      }>
        <ImageSprite
          item={item}
          getPosition={getCurrentPosition}
          handlePointerDown={handlePointerDown}
          isFocused={isFocused}
          isDragging={isDragging}
        />
      </Suspense>
    );
  }

  // Fallback to sphere for items without thumbnails
  return (
    <mesh
      ref={meshRef}
      onPointerDown={handlePointerDown}
    >
      <sphereGeometry args={[0.5, 16, 16]} />
      <meshStandardMaterial
        color={getColor()}
        emissive={'#000000'}
        emissiveIntensity={0}
      />
    </mesh>
  );
}
