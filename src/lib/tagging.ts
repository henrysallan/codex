import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

interface TaggingResult {
  title: string;
  tags: string[];
  description: string;
  rawResponse: string;
}

/**
 * Generate tags for an image using Claude Haiku API
 * @param imageUrl - Public URL of the image (from R2 or elsewhere)
 * @param imageType - MIME type of the image
 * @returns Generated title, tags, and description
 */
export async function generateImageTags(
  imageUrl: string,
  imageType?: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
): Promise<TaggingResult> {
  const generateTags = httpsCallable<
    { imageUrl: string; imageType?: string },
    TaggingResult
  >(functions, 'generateImageTags');

  const result = await generateTags({ imageUrl, imageType });
  return result.data;
}
