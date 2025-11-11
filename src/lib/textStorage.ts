import { ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './firebase';
import type { OutputData } from '@editorjs/editorjs';

/**
 * Save Editor.js content to Firebase Storage
 */
export async function saveTextContent(storagePath: string, data: OutputData): Promise<void> {
  const storageRef = ref(storage, storagePath);
  await uploadString(storageRef, JSON.stringify(data), 'raw', {
    contentType: 'application/json',
  });
}

/**
 * Load Editor.js content from Firebase Storage
 */
export async function loadTextContent(storagePath: string): Promise<OutputData> {
  const storageRef = ref(storage, storagePath);
  const url = await getDownloadURL(storageRef);
  const response = await fetch(url);
  return await response.json();
}

/**
 * Delete text content from Firebase Storage
 */
export async function deleteTextContent(storagePath: string): Promise<void> {
  const storageRef = ref(storage, storagePath);
  await deleteObject(storageRef);
}

/**
 * Create an empty Editor.js document
 */
export function createEmptyDocument(): OutputData {
  return {
    time: Date.now(),
    blocks: [],
    version: '2.28.0',
  };
}
