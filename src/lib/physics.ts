export interface PhysicsNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetX: number;
  targetY: number;
  radius: number;
  mass: number;
  pinned?: boolean; // If true, ignore all forces (for dragging)
  collectionIds?: string[]; // Collections this node belongs to
  tags?: string[]; // Tags for similarity-based attraction
}

export interface PhysicsConfig {
  targetStrength: number;
  repulsionStrength: number;
  repulsionRadius: number;
  collisionEnabled: boolean;
  damping: number;
  velocityThreshold: number;
  deltaTime: number;
  collectionAttractionStrength: number; // NEW: How strongly items in same collection attract
  tagAttractionStrength: number; // NEW: How strongly items with same tags attract
}

const DEFAULT_CONFIG: PhysicsConfig = {
  targetStrength: 0.5, // Medium pull to maintain similarity-calculated position
  repulsionStrength: 1.2, // Moderate repulsion to spread overlapping items
  repulsionRadius: 12,
  collisionEnabled: true,
  damping: 0.8, // Higher damping = slower, smoother movement
  velocityThreshold: 0.001, // Lower threshold for smoother motion
  deltaTime: 0.016, // ~60fps
  collectionAttractionStrength: 0.2, // Very weak - layout already handles this strongly
  tagAttractionStrength: 0.05, // Very weak - layout already handles this
};

export class PhysicsSimulation {
  private nodes: Map<string, PhysicsNode> = new Map();
  private config: PhysicsConfig;
  private spatialGrid: Map<string, string[]> = new Map();
  private gridCellSize: number = 10;

  constructor(config: Partial<PhysicsConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setNode(node: PhysicsNode): void {
    this.nodes.set(node.id, { ...node });
  }

  removeNode(id: string): void {
    this.nodes.delete(id);
  }

  getNode(id: string): PhysicsNode | undefined {
    return this.nodes.get(id);
  }

  getAllNodes(): PhysicsNode[] {
    return Array.from(this.nodes.values());
  }

  update(): void {
    if (this.nodes.size === 0) return;

    this.buildSpatialGrid();

    const forces = new Map<string, { fx: number; fy: number }>();

    for (const [id] of this.nodes) {
      forces.set(id, { fx: 0, fy: 0 });
    }

    for (const node of this.nodes.values()) {
      // Skip force calculations for pinned nodes (being dragged)
      if (node.pinned) continue;
      
      const force = forces.get(node.id)!;

      this.applyTargetAttraction(node, force);

      const neighbors = this.getNeighbors(node);
      for (const neighbor of neighbors) {
        if (neighbor.id !== node.id) {
          this.applyRepulsion(node, neighbor, force);
          
          // Apply collection-based attraction (items in same collection pull together)
          this.applyCollectionAttraction(node, neighbor, force);
          
          // Apply tag-based attraction (items with similar tags pull together)
          this.applyTagAttraction(node, neighbor, force);
        }
      }
    }

    for (const node of this.nodes.values()) {
      // Skip physics integration for pinned nodes
      if (node.pinned) continue;
      
      const force = forces.get(node.id)!;
      
      node.vx += (force.fx / node.mass) * this.config.deltaTime;
      node.vy += (force.fy / node.mass) * this.config.deltaTime;

      node.vx *= this.config.damping;
      node.vy *= this.config.damping;

      const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
      if (speed < this.config.velocityThreshold) {
        node.vx = 0;
        node.vy = 0;
      }

      node.x += node.vx * this.config.deltaTime;
      node.y += node.vy * this.config.deltaTime;
    }

    if (this.config.collisionEnabled) {
      this.resolveCollisions();
    }
  }

  private applyTargetAttraction(
    node: PhysicsNode,
    force: { fx: number; fy: number }
  ): void {
    const dx = node.targetX - node.x;
    const dy = node.targetY - node.y;
    
    force.fx += dx * this.config.targetStrength;
    force.fy += dy * this.config.targetStrength;
  }

  private applyRepulsion(
    node: PhysicsNode,
    other: PhysicsNode,
    force: { fx: number; fy: number }
  ): void {
    const dx = node.x - other.x;
    const dy = node.y - other.y;
    const distSq = dx * dx + dy * dy;
    const dist = Math.sqrt(distSq);

    if (dist < this.config.repulsionRadius && dist > 0.01) {
      const strength = this.config.repulsionStrength * (1 - dist / this.config.repulsionRadius);
      const fx = (dx / dist) * strength;
      const fy = (dy / dist) * strength;
      
      force.fx += fx;
      force.fy += fy;
    }
  }

  private applyCollectionAttraction(
    node: PhysicsNode,
    other: PhysicsNode,
    force: { fx: number; fy: number }
  ): void {
    // Skip if either node doesn't have collection info
    if (!node.collectionIds || !other.collectionIds) return;
    if (node.collectionIds.length === 0 || other.collectionIds.length === 0) return;

    // Check if they share any collections
    const sharedCollections = node.collectionIds.filter(id => other.collectionIds!.includes(id));
    if (sharedCollections.length === 0) return;

    // Calculate attraction force towards the other node
    const dx = other.x - node.x;
    const dy = other.y - node.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0.01) {
      // Stronger pull for items in the same collection
      const strength = this.config.collectionAttractionStrength;
      const fx = (dx / dist) * strength;
      const fy = (dy / dist) * strength;
      
      force.fx += fx;
      force.fy += fy;
    }
  }

  private applyTagAttraction(
    node: PhysicsNode,
    other: PhysicsNode,
    force: { fx: number; fy: number }
  ): void {
    // Skip if either node doesn't have tags
    if (!node.tags || !other.tags) return;
    if (node.tags.length === 0 || other.tags.length === 0) return;

    // Calculate Jaccard similarity
    const setA = new Set(node.tags.map(t => t.toLowerCase()));
    const setB = new Set(other.tags.map(t => t.toLowerCase()));
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    
    if (intersection.size === 0) return;
    
    const similarity = intersection.size / union.size;

    // Calculate attraction force towards the other node
    const dx = other.x - node.x;
    const dy = other.y - node.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0.01) {
      // Tag-based attraction scaled by similarity
      const strength = this.config.tagAttractionStrength * similarity;
      const fx = (dx / dist) * strength;
      const fy = (dy / dist) * strength;
      
      force.fx += fx;
      force.fy += fy;
    }
  }

  private resolveCollisions(): void {
    const nodeArray = Array.from(this.nodes.values());

    for (let i = 0; i < nodeArray.length; i++) {
      const a = nodeArray[i];

      for (let j = i + 1; j < nodeArray.length; j++) {
        const b = nodeArray[j];

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = a.radius + b.radius;

        if (dist < minDist && dist > 0.01) {
          const overlap = minDist - dist;
          const nx = dx / dist;
          const ny = dy / dist;

          // Only move nodes that aren't pinned
          if (!a.pinned && !b.pinned) {
            // Both can move - split the correction
            a.x -= nx * overlap * 0.5;
            a.y -= ny * overlap * 0.5;
            b.x += nx * overlap * 0.5;
            b.y += ny * overlap * 0.5;
          } else if (!a.pinned && b.pinned) {
            // Only a can move
            a.x -= nx * overlap;
            a.y -= ny * overlap;
          } else if (a.pinned && !b.pinned) {
            // Only b can move
            b.x += nx * overlap;
            b.y += ny * overlap;
          }
          // If both pinned, don't move either

          // Bounce velocity only for non-pinned nodes
          if (!a.pinned || !b.pinned) {
            const relVelX = a.vx - b.vx;
            const relVelY = a.vy - b.vy;
            const velAlongNormal = relVelX * nx + relVelY * ny;

            if (velAlongNormal < 0) {
              const bounce = 0.5;
              if (!a.pinned) {
                a.vx -= velAlongNormal * nx * bounce;
                a.vy -= velAlongNormal * ny * bounce;
              }
              if (!b.pinned) {
                b.vx += velAlongNormal * nx * bounce;
                b.vy += velAlongNormal * ny * bounce;
              }
            }
          }
        }
      }
    }
  }

  private buildSpatialGrid(): void {
    this.spatialGrid.clear();

    for (const node of this.nodes.values()) {
      const cellKey = this.getCellKey(node.x, node.y);
      if (!this.spatialGrid.has(cellKey)) {
        this.spatialGrid.set(cellKey, []);
      }
      this.spatialGrid.get(cellKey)!.push(node.id);
    }
  }

  private getNeighbors(node: PhysicsNode): PhysicsNode[] {
    const neighbors: PhysicsNode[] = [];
    const cellX = Math.floor(node.x / this.gridCellSize);
    const cellY = Math.floor(node.y / this.gridCellSize);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = `${cellX + dx},${cellY + dy}`;
        const nodeIds = this.spatialGrid.get(key);
        if (nodeIds) {
          for (const id of nodeIds) {
            const neighbor = this.nodes.get(id);
            if (neighbor && neighbor.id !== node.id) {
              neighbors.push(neighbor);
            }
          }
        }
      }
    }

    return neighbors;
  }

  private getCellKey(x: number, y: number): string {
    const cellX = Math.floor(x / this.gridCellSize);
    const cellY = Math.floor(y / this.gridCellSize);
    return `${cellX},${cellY}`;
  }

  setConfig(config: Partial<PhysicsConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
