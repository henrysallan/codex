import { functions } from './firebase';
import { httpsCallable } from 'firebase/functions';

interface UploadUrlResponse {
  uploadUrl: string;
  key: string;
  publicUrl: string;
}

/**
 * Get a presigned upload URL from Cloud Functions
 */
async function getUploadUrl(fileName: string, fileType: string): Promise<UploadUrlResponse> {
  const getUrl = httpsCallable<{ fileName: string; fileType: string }, UploadUrlResponse>(
    functions,
    'getUploadUrl'
  );
  
  const result = await getUrl({ fileName, fileType });
  return result.data;
}

/**
 * Upload a file to R2 using the presigned URL
 */
async function uploadToR2(file: File, uploadUrl: string): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: {
      'Content-Type': file.type,
    },
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.statusText}`);
  }
}

/**
 * Complete upload flow: get URL, upload file, save to Firestore
 */
export async function uploadImage(
  file: File,
  onProgress?: (progress: number) => void
): Promise<{ key: string; publicUrl: string }> {
  try {
    // Step 1: Get presigned upload URL
    onProgress?.(10);
    const { uploadUrl, key, publicUrl } = await getUploadUrl(file.name, file.type);

    // Step 2: Upload to R2
    onProgress?.(30);
    await uploadToR2(file, uploadUrl);
    
    onProgress?.(70);

    // Step 3: Return the URLs
    onProgress?.(100);
    return { key, publicUrl };
  } catch (error) {
    console.error('Upload error:', error);
    throw error;
  }
}
