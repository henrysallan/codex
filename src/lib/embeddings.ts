import { pipeline, env } from '@xenova/transformers';

// Configure transformers.js environment
env.allowLocalModels = false;
env.allowRemoteModels = true;

let embedder: any = null;
let initializationPromise: Promise<any> | null = null;

/**
 * Initialize the embedding model
 * Uses Xenova/all-MiniLM-L6-v2 for 384-dimension embeddings
 */
export async function initializeEmbedder() {
  if (embedder) {
    return embedder;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
      console.log('Loading embedding model...');
      embedder = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
        {
          progress_callback: (progress: any) => {
            if (progress.status === 'progress') {
              console.log(`Model loading: ${progress.file} - ${Math.round(progress.progress)}%`);
            }
          }
        }
      );
      console.log('Embedding model loaded successfully!');
      return embedder;
    } catch (error) {
      console.error('Failed to initialize embedder:', error);
      initializationPromise = null;
      throw error;
    }
  })();

  return initializationPromise;
}

/**
 * Generate embedding vector for any text
 * @param text - Input text to embed
 * @returns 384-dimension embedding vector
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const model = await initializeEmbedder();
  const output = await model(text, {
    pooling: 'mean',
    normalize: true,
  });
  return Array.from(output.data);
}

/**
 * Calculate cosine similarity between two vectors
 * @param a - First embedding vector
 * @param b - Second embedding vector
 * @returns Similarity score between 0 and 1
 */
export function cosineSimilarity(a: number[], b: number[]): number {
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
