import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Anthropic from '@anthropic-ai/sdk';
import { defineSecret } from 'firebase-functions/params';

// Define secrets (they won't be in the code or GitHub)
const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

admin.initializeApp();

/**
 * Generate presigned URL for R2 upload
 * This is a placeholder - you'll need to add R2 SDK and credentials
 */
export const getUploadUrl = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated'
    );
  }

  const { fileName, fileType } = data;
  const userId = context.auth.uid;

  // TODO: Implement R2 presigned URL generation
  // For now, return a placeholder
  console.log('Generating upload URL for:', { userId, fileName, fileType });

  return {
    url: 'https://placeholder-url.com',
    key: `uploads/${userId}/${Date.now()}-${fileName}`,
  };
});

/**
 * Process uploaded content
 * Triggered when a new item is added to Firestore
 */
export const processContent = functions.firestore
  .document('items/{itemId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    
    console.log('Processing new content:', data.title);

    // TODO: Implement:
    // 1. Generate thumbnail
    // 2. OCR processing
    // 3. AI tagging (OpenAI API)
    // 4. Update document with processed data

    return null;
  });

/**
 * Health check endpoint
 */
export const healthCheck = functions.https.onRequest((req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Generate tags for an image using Claude Haiku
 * Call this from the client with image URL
 */
export const generateImageTags = functions
  .runWith({ secrets: [anthropicApiKey] })
  .https.onCall(async (data: { imageUrl: string; imageType?: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' }, context) => {
    // Verify authentication
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const { imageUrl, imageType = 'image/jpeg' } = data;

    try {
      // Initialize Anthropic client with the secret API key
      const anthropic = new Anthropic({
        apiKey: anthropicApiKey.value(),
      });

      // Fetch the image from the URL
      const imageResponse = await fetch(imageUrl);
      const imageBuffer = await imageResponse.arrayBuffer();
      const base64Image = Buffer.from(imageBuffer).toString('base64');

      // Use Claude Haiku to analyze the image
      const response = await anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: imageType,
                  data: base64Image,
                },
              },
              {
                type: 'text',
                text: `Analyze this image and provide:
1. A concise title (max 50 characters)
2. 5-10 relevant tags (single words or short phrases)
3. A brief description (1-2 sentences)

Return as JSON in this format:
{
  "title": "...",
  "tags": ["tag1", "tag2", ...],
  "description": "..."
}`,
              },
            ],
          },
        ],
      });

      // Parse the response
      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      // Extract JSON from the response
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Could not parse JSON from Claude response');
      }

      const result = JSON.parse(jsonMatch[0]);

      return {
        title: result.title,
        tags: result.tags,
        description: result.description,
        rawResponse: content.text,
      };
    } catch (error: any) {
      console.error('Error generating tags:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to generate tags',
        error.message
      );
    }
  });
