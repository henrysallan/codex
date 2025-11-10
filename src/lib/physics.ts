import type { Vector3D } from '../types';

const MIN_DISTANCE = 5;
const ATTRACTION_STRENGTH = 0.01;
const REPULSION_STRENGTH = 0.5;
const CENTER_GRAVITY = 0.001;
const DAMPING = 0.95;

interface ForceNode {
  id: string;
  position: Vector3D;
  velocity: Vector3D;
  mass: number;
  embedding: number[];
}

/**
 * Calculate forces acting on a node from nearby nodes
 */
export function calculateForces(
  node: ForceNode,
  others: ForceNode[]
): Vector3D {
  let force: Vector3D = { x: 0, y: 0, z: 0 };

  others.forEach((other) => {
    if (node.id === other.id) return;

    const distance = calculateDistance(node.position, other.position);
    const similarity = cosineSimilarity(node.embedding, other.embedding);

    // Attraction for similar items
    if (similarity > 0.7) {
      force = addForce(force, attractionForce(node, other, similarity));
    }

    // Repulsion to prevent overlap
    if (distance < MIN_DISTANCE) {
      force = addForce(force, repulsionForce(node, other, distance));
    }
  });

  // Gentle center gravity
  force = addForce(force, centerGravity(node));

  return force;
}

/**
 * Update node velocity based on forces
 */
export function updateVelocity(
  velocity: Vector3D,
  force: Vector3D,
  delta: number
): Vector3D {
  return {
    x: (velocity.x + force.x * delta) * DAMPING,
    y: (velocity.y + force.y * delta) * DAMPING,
    z: (velocity.z + force.z * delta) * DAMPING,
  };
}

/**
 * Calculate distance between two points
 */
function calculateDistance(a: Vector3D, b: Vector3D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculate attraction force between similar nodes
 */
function attractionForce(
  node: ForceNode,
  other: ForceNode,
  similarity: number
): Vector3D {
  const dx = other.position.x - node.position.x;
  const dy = other.position.y - node.position.y;
  const dz = other.position.z - node.position.z;

  const strength = ATTRACTION_STRENGTH * similarity;

  return {
    x: dx * strength,
    y: dy * strength,
    z: dz * strength,
  };
}

/**
 * Calculate repulsion force to prevent overlap
 */
function repulsionForce(
  node: ForceNode,
  other: ForceNode,
  distance: number
): Vector3D {
  const dx = node.position.x - other.position.x;
  const dy = node.position.y - other.position.y;
  const dz = node.position.z - other.position.z;

  const strength = REPULSION_STRENGTH / (distance * distance);

  return {
    x: dx * strength,
    y: dy * strength,
    z: dz * strength,
  };
}

/**
 * Gentle gravity toward center
 */
function centerGravity(node: ForceNode): Vector3D {
  return {
    x: -node.position.x * CENTER_GRAVITY,
    y: -node.position.y * CENTER_GRAVITY,
    z: -node.position.z * CENTER_GRAVITY,
  };
}

/**
 * Add two force vectors
 */
function addForce(a: Vector3D, b: Vector3D): Vector3D {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
    z: a.z + b.z,
  };
}

/**
 * Calculate cosine similarity between embeddings
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
