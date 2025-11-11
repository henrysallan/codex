import { useRef, useImperativeHandle, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import GraphNodes from './graph/GraphNodes';
import RelationLines from './graph/RelationLines';
import type { ContentItem } from '../types';
import gsap from 'gsap';

interface GraphViewProps {
  items: ContentItem[];
  onFocusItem: (item: ContentItem, position: { x: number; y: number; z: number }) => void;
  cameraControlsRef: React.RefObject<any>;
  focusedItemId: string | null;
  similarityThreshold?: number; // Threshold for drawing relation lines (0-1), default 0.3
}

interface GraphSceneProps {
  items: ContentItem[];
  onFocusItem: (item: ContentItem, position: { x: number; y: number; z: number }) => void;
  focusedItemId: string | null;
  similarityThreshold: number;
}

// Scene component that renders both nodes and lines with shared physics state
function GraphScene({ items, onFocusItem, focusedItemId, similarityThreshold }: GraphSceneProps) {
  const physicsPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const { camera } = useThree();

  // Center camera on items when they first load
  useEffect(() => {
    if (items.length === 0) return;

    // Calculate bounding box of all items
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    items.forEach(item => {
      if (item.umap_coords) {
        minX = Math.min(minX, item.umap_coords.x);
        maxX = Math.max(maxX, item.umap_coords.x);
        minY = Math.min(minY, item.umap_coords.y);
        maxY = Math.max(maxY, item.umap_coords.y);
      }
    });

    // Calculate center and size
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const width = maxX - minX;
    const height = maxY - minY;
    const maxDim = Math.max(width, height, 30); // Minimum 30 units

    // Set camera to view all items with padding
    const distance = maxDim * 0.8; // Adjust multiplier for zoom level
    camera.position.set(centerX, centerY, distance);
    camera.lookAt(centerX, centerY, 0);
  }, [items, camera]);

  return (
    <>
      {/* Render lines first so they appear behind nodes */}
      <RelationLines 
        items={items} 
        similarityThreshold={similarityThreshold}
        physicsPositions={physicsPositionsRef.current}
      />
      <GraphNodes 
        items={items} 
        onFocusItem={onFocusItem} 
        focusedItemId={focusedItemId}
        physicsPositionsRef={physicsPositionsRef}
      />
    </>
  );
}

// Camera controller component to handle focus animations and shift+pan
function CameraController({ cameraControlsRef }: { cameraControlsRef: React.RefObject<any> }) {
  const { camera, gl } = useThree();
  const controlsRef = useRef<any>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const isTouchPanning = useRef(false);
  const touchStartDistance = useRef(0);
  const lastTouchMoveTime = useRef(0);
  const targetZoom = useRef(50);

  // Pan state - smoothly interpolate to target position
  const targetPanPosition = useRef({ x: camera.position.x, y: camera.position.y });
  const targetPanTarget = useRef({ x: 0, y: 0 });

  // Apply camera updates every frame with light smoothing for touch
  useFrame(() => {
    if (!controlsRef.current) return;

    // Light smoothing for touch interactions to reduce choppiness
    const smoothingFactor = isTouchPanning.current ? 0.3 : 1.0;
    
    camera.position.x += (targetPanPosition.current.x - camera.position.x) * smoothingFactor;
    camera.position.y += (targetPanPosition.current.y - camera.position.y) * smoothingFactor;
    camera.position.z += (targetZoom.current - camera.position.z) * smoothingFactor;
    
    controlsRef.current.target.x += (targetPanTarget.current.x - controlsRef.current.target.x) * smoothingFactor;
    controlsRef.current.target.y += (targetPanTarget.current.y - controlsRef.current.target.y) * smoothingFactor;
    
    controlsRef.current.update();
  });

  // Handle shift+click panning and trackpad two-finger pan
  useEffect(() => {
    const canvas = gl.domElement;

    // Initialize target positions
    targetPanPosition.current = { x: camera.position.x, y: camera.position.y };
    if (controlsRef.current) {
      targetPanTarget.current = { x: controlsRef.current.target.x, y: controlsRef.current.target.y };
    }

    const handleMouseDown = (e: MouseEvent) => {
      if (e.shiftKey && (e.button === 0 || e.button === 1)) {
        e.preventDefault();
        isPanning.current = true;
        panStart.current = { x: e.clientX, y: e.clientY };
        document.body.style.cursor = 'grabbing';
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isPanning.current && controlsRef.current) {
        const deltaX = e.clientX - panStart.current.x;
        const deltaY = e.clientY - panStart.current.y;

        // Calculate pan based on camera distance
        const distance = camera.position.z;
        const panSpeed = distance * 0.001;

        const panDeltaX = -deltaX * panSpeed;
        const panDeltaY = deltaY * panSpeed;

        // Update target positions directly (1:1 movement)
        targetPanPosition.current.x += panDeltaX;
        targetPanPosition.current.y += panDeltaY;
        targetPanTarget.current.x += panDeltaX;
        targetPanTarget.current.y += panDeltaY;

        panStart.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleMouseUp = () => {
      if (isPanning.current) {
        isPanning.current = false;
        document.body.style.cursor = 'default';
      }
    };

    // Touch handling for mobile and trackpad
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        // Single finger on mobile = just for tapping nodes, not panning
        // Don't do anything here, let the node handle it
        return;
      } else if (e.touches.length === 2) {
        e.preventDefault();
        isTouchPanning.current = true;

        const touch1 = e.touches[0];
        const touch2 = e.touches[1];

        // Store center point of two fingers
        panStart.current = {
          x: (touch1.clientX + touch2.clientX) / 2,
          y: (touch1.clientY + touch2.clientY) / 2,
        };

        // Calculate initial distance between fingers for pinch detection
        const dx = touch2.clientX - touch1.clientX;
        const dy = touch2.clientY - touch1.clientY;
        touchStartDistance.current = Math.sqrt(dx * dx + dy * dy);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && controlsRef.current) {
        // Throttle touch move events to reduce choppiness (max 60fps)
        const now = Date.now();
        if (now - lastTouchMoveTime.current < 16) {
          return; // Skip this update
        }
        lastTouchMoveTime.current = now;

        // Two finger handling (pan on desktop trackpad, pinch zoom on mobile)
        e.preventDefault();

        const touch1 = e.touches[0];
        const touch2 = e.touches[1];

        // Current center point
        const centerX = (touch1.clientX + touch2.clientX) / 2;
        const centerY = (touch1.clientY + touch2.clientY) / 2;

        // Current distance between fingers
        const dx = touch2.clientX - touch1.clientX;
        const dy = touch2.clientY - touch1.clientY;
        const currentDistance = Math.sqrt(dx * dx + dy * dy);

        // Check if it's a pinch zoom gesture
        const distanceChange = currentDistance - touchStartDistance.current;
        const isPinchZoom = Math.abs(distanceChange) > 10;

        if (isPinchZoom) {
          // Smooth pinch to zoom
          const zoomFactor = currentDistance / touchStartDistance.current;
          const zoomAmount = (1 - zoomFactor) * camera.position.z * 0.5;
          
          targetZoom.current = Math.max(10, Math.min(100, camera.position.z + zoomAmount));
          
          touchStartDistance.current = currentDistance;
        } else {
          // Pan gesture
          const deltaX = centerX - panStart.current.x;
          const deltaY = centerY - panStart.current.y;

          // Calculate pan based on camera distance
          const distance = camera.position.z;
          const panSpeed = distance * 0.001;

          const panDeltaX = -deltaX * panSpeed;
          const panDeltaY = deltaY * panSpeed;

          // Update target positions directly (1:1 movement)
          targetPanPosition.current.x += panDeltaX;
          targetPanPosition.current.y += panDeltaY;
          targetPanTarget.current.x += panDeltaX;
          targetPanTarget.current.y += panDeltaY;

          panStart.current = { x: centerX, y: centerY };
        }
      }
    };

    const handleTouchEnd = () => {
      isTouchPanning.current = false;
      touchStartDistance.current = 0;
    };

    // Custom wheel handler - pan or pinch-to-zoom
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      if (!controlsRef.current) return;

      // Trackpad pinch-to-zoom on Mac sets ctrlKey = true
      const isPinchZoom = e.ctrlKey;

      if (isPinchZoom) {
        // Smooth zoom for trackpad
        const zoomSpeed = 0.025;
        const delta = e.deltaY > 0 ? 1 : -1;
        const zoomAmount = delta * zoomSpeed * camera.position.z;

        // Update zoom target for smooth interpolation
        targetZoom.current = Math.max(10, Math.min(100, targetZoom.current + zoomAmount));
      } else {
        // Pan - both trackpad two-finger drag and mouse scroll wheel
        const distance = camera.position.z;
        const panSpeed = distance * 0.0015;

        const panDeltaX = e.deltaX * panSpeed;
        const panDeltaY = -e.deltaY * panSpeed;

        // Update target positions directly (1:1 movement)
        targetPanPosition.current.x += panDeltaX;
        targetPanPosition.current.y += panDeltaY;
        targetPanTarget.current.x += panDeltaX;
        targetPanTarget.current.y += panDeltaY;
      }
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);
    canvas.addEventListener('touchcancel', handleTouchEnd);
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('touchcancel', handleTouchEnd);
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [camera, gl, controlsRef]);

  useImperativeHandle(cameraControlsRef, () => ({
    focusOn: (position: { x: number; y: number; z: number }) => {
      // Calculate target camera position (50% closer than before)
      // Offset X to the right to account for the sidebar on the right
      const sidebarOffset = 2; // Subtle shift right so image sits nicely with sidebar
      const targetCameraPos = {
        x: position.x + sidebarOffset,
        y: position.y,
        z: 10, // Much closer (was 20, now 50% closer)
      };

      // Animate camera to new position
      gsap.to(camera.position, {
        duration: 1,
        x: targetCameraPos.x,
        y: targetCameraPos.y,
        z: targetCameraPos.z,
        ease: 'power2.inOut',
      });

      // Animate controls target (also offset for sidebar)
      if (controlsRef.current) {
        gsap.to(controlsRef.current.target, {
          duration: 1,
          x: position.x + sidebarOffset,
          y: position.y,
          z: position.z,
          ease: 'power2.inOut',
          onUpdate: () => {
            controlsRef.current?.update();
          },
        });
      }
    },
  }));

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false} // Disable built-in pan (we handle it custom)
      enableZoom={false} // Disable built-in zoom to prevent trackpad conflicts
      enableRotate={false}
      maxDistance={100}
      minDistance={10}
      // Mouse: all disabled, we handle everything custom
      mouseButtons={{
        LEFT: undefined, // Disable left click (we'll use it for dragging nodes)
        MIDDLE: undefined, // Disable middle click by default
        RIGHT: undefined, // Disable right click
      }}
      // Trackpad: disable default touch controls (we handle custom)
      touches={{
        ONE: undefined, // Disable one finger (we'll use it for dragging nodes)
        TWO: undefined, // Disable two finger (we handle custom pan)
      }}
      // Enable pan with keyboard
      keys={{
        LEFT: 'KeyA',
        UP: 'KeyW',
        RIGHT: 'KeyD',
        BOTTOM: 'KeyS'
      }}
      keyPanSpeed={10}
    />
  );
}

export default function GraphView({ items, onFocusItem, cameraControlsRef, focusedItemId, similarityThreshold = 0.3 }: GraphViewProps) {
  return (
    <div className="w-full h-screen">
      <Canvas>
        <PerspectiveCamera makeDefault position={[0, 0, 50]} />
        <CameraController cameraControlsRef={cameraControlsRef} />
        <ambientLight intensity={0.8} />
        <pointLight position={[0, 0, 50]} intensity={0.5} />
        <GraphScene 
          items={items} 
          onFocusItem={onFocusItem}
          focusedItemId={focusedItemId}
          similarityThreshold={similarityThreshold}
        />
      </Canvas>
    </div>
  );
}
