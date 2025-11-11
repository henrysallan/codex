import { useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { ContentItem } from '../../types';
import GraphNode from './GraphNode';
import { PhysicsSimulation, type PhysicsNode } from '../../lib/physics';
import * as THREE from 'three';

interface GraphNodesProps {
  items: ContentItem[];
  onFocusItem: (item: ContentItem, position: { x: number; y: number; z: number }) => void;
  focusedItemId: string | null;
  physicsPositionsRef?: React.RefObject<Map<string, { x: number; y: number }>>;
}

export default function GraphNodes({ items, onFocusItem, focusedItemId, physicsPositionsRef }: GraphNodesProps) {
  const { camera, gl, pointer } = useThree();
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const physicsRef = useRef<PhysicsSimulation>(new PhysicsSimulation({
    targetStrength: 100.0, // Extremely strong pull back to target position
    repulsionStrength: 2.0, // Stronger repulsion forces
    repulsionRadius: 12,
    damping: 0.15, // Even lower damping = nearly instant, very snappy movement
    deltaTime: 0.016, // ~60fps for smoother physics
  }));
  const nodePositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const initialized = useRef(false);

  // Drag state
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const dragThreshold = 5; // pixels to move before it's considered a drag
  const isDragging = useRef(false);
  const dragPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));
  const dragOffset = useRef(new THREE.Vector3());
  const unpinTimeout = useRef<number | null>(null);
  const lastPinnedNodeId = useRef<string | null>(null);

  // Handle pointer down (start of potential drag or click)
  const handlePointerDown = (itemId: string, event: any) => {
    if (event.shiftKey) return;

    event.stopPropagation();
    setDraggedNodeId(itemId);
    isDragging.current = false;

    // Store start position to detect drag vs click
    dragStartPos.current = { x: event.clientX, y: event.clientY };

    // On mobile, we only handle taps (clicks), not dragging
    // So we skip the pinning logic but still process the tap
    if (isMobile) {
      return;
    }

    // Clear any pending unpin timeout and unpin the previous node immediately
    if (unpinTimeout.current) {
      clearTimeout(unpinTimeout.current);
      unpinTimeout.current = null;
    }

    // Unpin any previously pinned node immediately when starting a new drag
    if (lastPinnedNodeId.current && lastPinnedNodeId.current !== itemId) {
      const prevNode = physicsRef.current.getNode(lastPinnedNodeId.current);
      if (prevNode && prevNode.pinned) {
        prevNode.pinned = false;
        physicsRef.current.setNode(prevNode);
      }
    }

    // Pin the node immediately
    const node = physicsRef.current.getNode(itemId);
    if (node) {
      node.pinned = true;
      node.vx = 0;
      node.vy = 0;
      physicsRef.current.setNode(node);
      lastPinnedNodeId.current = itemId;

      // Calculate drag offset
      const raycasterInstance = new THREE.Raycaster();
      raycasterInstance.setFromCamera(pointer, camera);
      const intersection = new THREE.Vector3();
      raycasterInstance.ray.intersectPlane(dragPlane.current, intersection);

      dragOffset.current.set(
        node.x - intersection.x,
        node.y - intersection.y,
        0
      );
    }
  };

  // Handle pointer up (end of drag or click)
  const handlePointerUp = (itemId: string) => {
    if (draggedNodeId === itemId) {
      const nodeId = draggedNodeId;

      // If we didn't drag, trigger click (works on both desktop and mobile)
      if (!isDragging.current) {
        // Find the item and call onFocusItem
        const item = items.find(i => i.id === itemId);
        const node = physicsRef.current.getNode(itemId);
        if (item && node) {
          onFocusItem(item, { x: node.x, y: node.y, z: 0 });
        }
      }

      // Only unpin on desktop (mobile never pins)
      if (!isMobile) {
        const node = physicsRef.current.getNode(nodeId);
        if (node) {
          node.pinned = false;
          physicsRef.current.setNode(node);
        }
      }
    }

    setDraggedNodeId(null);
    dragStartPos.current = null;
    isDragging.current = false;
  };

  // Mouse move handler for dragging
  useEffect(() => {
    const canvas = gl.domElement;

    const handleMouseMove = (e: MouseEvent) => {
      if (draggedNodeId && dragStartPos.current && !isMobile) {
        // Check if we've moved enough to be considered dragging
        const dx = e.clientX - dragStartPos.current.x;
        const dy = e.clientY - dragStartPos.current.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > dragThreshold) {
          isDragging.current = true;
        }

        // Update node position if we're dragging
        if (isDragging.current) {
          const node = physicsRef.current.getNode(draggedNodeId);
          if (node) {
            const rect = canvas.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            const raycasterInstance = new THREE.Raycaster();
            raycasterInstance.setFromCamera(new THREE.Vector2(x, y), camera);
            const intersection = new THREE.Vector3();
            raycasterInstance.ray.intersectPlane(dragPlane.current, intersection);

            // Update node position directly
            node.x = intersection.x + dragOffset.current.x;
            node.y = intersection.y + dragOffset.current.y;
            physicsRef.current.setNode(node);

            // Update position map immediately
            nodePositions.current.set(node.id, { x: node.x, y: node.y });
          }
        }
      }
    };

    const handleMouseUp = () => {
      if (draggedNodeId) {
        handlePointerUp(draggedNodeId);
      }
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseUp);

      if (unpinTimeout.current) {
        clearTimeout(unpinTimeout.current);
      }
    };
  }, [gl, draggedNodeId, camera, items, onFocusItem, isMobile]);

  // Initialize physics simulation when items change
  useEffect(() => {
    const physics = physicsRef.current;
    
    // Remove nodes that no longer exist
    for (const existingNode of physics.getAllNodes()) {
      if (!items.find(item => item.id === existingNode.id)) {
        physics.removeNode(existingNode.id);
      }
    }

    // Add or update nodes
    for (const item of items) {
      if (!item.umap_coords) continue;

      const existing = physics.getNode(item.id);
      
      if (!existing) {
        // New node - start exactly on target position, let physics spread items out to prevent overlap
        const startX = item.umap_coords.x;
        const startY = item.umap_coords.y;

        const node: PhysicsNode = {
          id: item.id,
          x: startX,
          y: startY,
          vx: 0,
          vy: 0,
          targetX: item.umap_coords.x,
          targetY: item.umap_coords.y,
          radius: 4.5, // Increased from 3 to add more spacing between images
          mass: 1,
          collectionIds: item.collection_ids || (item.collectionId ? [item.collectionId] : []),
          tags: [...(item.tags || []), ...(item.aiTags || [])],
        };
        physics.setNode(node);
        nodePositions.current.set(item.id, { x: node.x, y: node.y });
      } else {
        // Update target if it changed
        if (existing.targetX !== item.umap_coords.x || existing.targetY !== item.umap_coords.y) {
          existing.targetX = item.umap_coords.x;
          existing.targetY = item.umap_coords.y;
          physics.setNode(existing);
        }
        
        // Also update collection and tag data in case it changed
        existing.collectionIds = item.collection_ids || (item.collectionId ? [item.collectionId] : []);
        existing.tags = [...(item.tags || []), ...(item.aiTags || [])];
        physics.setNode(existing);
      }
    }

    initialized.current = true;
  }, [items]);

  // Run physics simulation each frame IN THE RENDER LOOP for smooth updates
  useFrame(() => {
    const physics = physicsRef.current;

    // Run physics simulation - the simulation will skip pinned nodes automatically
    physics.update();

    // Update positions map for all nodes
    for (const node of physics.getAllNodes()) {
      nodePositions.current.set(node.id, { x: node.x, y: node.y });
    }

    // Share positions with parent if ref provided
    if (physicsPositionsRef?.current) {
      physicsPositionsRef.current = nodePositions.current;
    }
  });

  return (
    <group>
      {items.map((item, index) => {
        return (
          <GraphNode
            key={item.id}
            item={item}
            index={index}
            totalItems={items.length}
            onFocus={onFocusItem}
            isFocused={item.id === focusedItemId}
            positionsMapRef={nodePositions}
            onDragStart={handlePointerDown}
            isDragging={item.id === draggedNodeId}
          />
        );
      })}
    </group>
  );
}
