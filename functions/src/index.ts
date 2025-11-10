import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Anthropic from '@anthropic-ai/sdk';
import { defineSecret } from 'firebase-functions/params';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Define secrets (they won't be in the code or GitHub)
const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');
const r2AccessKeyId = defineSecret('R2_ACCESS_KEY_ID');
const r2SecretAccessKey = defineSecret('R2_SECRET_ACCESS_KEY');
const r2AccountId = defineSecret('R2_ACCOUNT_ID');
const r2BucketName = defineSecret('R2_BUCKET_NAME');

admin.initializeApp();

/**
 * Health check endpoint
 */
export const healthCheck = functions.https.onRequest((req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Generate a presigned URL for uploading files to R2
 */
export const getUploadUrl = functions
  .runWith({ 
    secrets: [r2AccessKeyId, r2SecretAccessKey, r2AccountId, r2BucketName] 
  })
  .https.onCall(async (data: { fileName: string; fileType: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { fileName, fileType } = data;
    const userId = context.auth.uid;
    
    // Generate a unique key for the file
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `uploads/${userId}/${timestamp}-${sanitizedFileName}`;

    try {
      // Configure R2 client (S3-compatible)
      const s3Client = new S3Client({
        region: 'auto',
        endpoint: `https://${r2AccountId.value()}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: r2AccessKeyId.value(),
          secretAccessKey: r2SecretAccessKey.value(),
        },
      });

      // Create presigned URL for PUT operation
      const command = new PutObjectCommand({
        Bucket: r2BucketName.value(),
        Key: key,
        ContentType: fileType,
      });

      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour

      // Also generate the public URL for accessing the file
      const publicUrl = `https://pub-977a7d4b63c4438980570a32245b687b.r2.dev/${key}`;

      return {
        uploadUrl,
        key,
        publicUrl,
      };
    } catch (error: any) {
      console.error('Error generating upload URL:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to generate upload URL',
        error.message
      );
    }
  });

/**
 * Process new content when it's added to Firestore
 * Automatically trigger image tagging
 */
export const processContent = functions
  .runWith({ secrets: [anthropicApiKey] })
  .firestore
  .document('items/{itemId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const itemId = context.params.itemId;
    
    console.log('Processing new content:', data.title, itemId);

    // If it's an image, automatically generate tags
    if (data.type === 'image' && data.url) {
      try {
        console.log('Auto-tagging image:', data.url);
        
        // Call the generateImageTags function internally
        // Note: In production, you might want to use a task queue
        const anthropic = new Anthropic({
          apiKey: anthropicApiKey.value(),
        });

        const imageResponse = await fetch(data.url);
        const imageBuffer = await imageResponse.arrayBuffer();
        const base64Image = Buffer.from(imageBuffer).toString('base64');

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
                    media_type: data.fileType || 'image/jpeg',
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

        const content = response.content[0];
        if (content.type === 'text') {
          const jsonMatch = content.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            
            // Update the document with AI-generated tags
            await snap.ref.update({
              aiTitle: result.title,
              aiTags: result.tags,
              aiDescription: result.description,
              processedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            
            console.log('Successfully tagged image:', itemId);
          }
        }
      } catch (error) {
        console.error('Error auto-tagging image:', error);
        // Don't throw - we don't want to fail the whole operation
      }
    }

    return null;
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
