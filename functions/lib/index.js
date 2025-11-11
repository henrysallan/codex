"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTextContent = exports.backfillCollectionReferences = exports.backfillImageColors = exports.generateImageTags = exports.deleteFromR2 = exports.processContent = exports.getUploadUrl = exports.uploadToR2 = exports.healthCheck = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const params_1 = require("firebase-functions/params");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const sharp_1 = __importDefault(require("sharp"));
// Define secrets (they won't be in the code or GitHub)
const anthropicApiKey = (0, params_1.defineSecret)('ANTHROPIC_API_KEY');
const r2AccessKeyId = (0, params_1.defineSecret)('R2_ACCESS_KEY_ID');
const r2SecretAccessKey = (0, params_1.defineSecret)('R2_SECRET_ACCESS_KEY');
const r2AccountId = (0, params_1.defineSecret)('R2_ACCOUNT_ID');
const r2BucketName = (0, params_1.defineSecret)('R2_BUCKET_NAME');
admin.initializeApp();
/**
 * Health check endpoint
 */
exports.healthCheck = functions.https.onRequest((req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
/**
 * Upload file directly to R2 using native fetch (bypasses AWS SDK issues)
 */
exports.uploadToR2 = functions
    .runWith({
    secrets: [r2AccessKeyId, r2SecretAccessKey, r2AccountId, r2BucketName],
    timeoutSeconds: 540,
    memory: '1GB'
})
    .https.onCall(async (data, context) => {
    var _a, _b;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { fileName, fileType, fileData } = data;
    const userId = context.auth.uid;
    // Generate a unique key for the file
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `uploads/${userId}/${timestamp}-${sanitizedFileName}`;
    try {
        // Decode base64 file data
        const buffer = Buffer.from(fileData, 'base64');
        // Trim secrets to avoid stray whitespace/newlines causing signature/header issues
        const accessKeyId = r2AccessKeyId.value().trim();
        const secretAccessKey = r2SecretAccessKey.value().trim();
        const accountId = r2AccountId.value().trim();
        const bucketName = r2BucketName.value().trim();
        // AWS SDK v3 S3 client targeting Cloudflare R2 (path-style forced for consistency)
        const client = new client_s3_1.S3Client({
            region: 'auto',
            endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
            forcePathStyle: true,
            credentials: {
                accessKeyId,
                secretAccessKey,
            },
        });
        // Get original image metadata to preserve aspect ratio
        const metadata = await (0, sharp_1.default)(buffer).metadata();
        // Generate thumbnail (max 256px on longest side) preserving aspect ratio
        const thumbnailBuffer = await (0, sharp_1.default)(buffer)
            .rotate() // Auto-rotate based on EXIF orientation
            .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();
        // Extract average color from a small resized version of the image
        const colorData = await (0, sharp_1.default)(buffer)
            .resize(100, 100, { fit: 'cover' }) // Small size for fast processing
            .raw() // Get raw pixel data
            .toBuffer({ resolveWithObject: true });
        // Calculate average RGB values
        const pixels = colorData.data;
        let r = 0, g = 0, b = 0;
        const pixelCount = pixels.length / 3;
        for (let i = 0; i < pixels.length; i += 3) {
            r += pixels[i];
            g += pixels[i + 1];
            b += pixels[i + 2];
        }
        const averageColor = [
            Math.round(r / pixelCount),
            Math.round(g / pixelCount),
            Math.round(b / pixelCount),
        ];
        // Calculate aspect ratio from original dimensions
        const aspectRatio = metadata.width && metadata.height ? metadata.width / metadata.height : 1;
        const thumbnailKey = `${key.replace(/\.[^.]+$/, '')}_thumb.jpg`;
        // Upload original image
        const putCmd = new client_s3_1.PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            ContentType: fileType,
        });
        const presigned = await (0, s3_request_presigner_1.getSignedUrl)(client, putCmd, { expiresIn: 900 });
        const putRes = await fetch(presigned, {
            method: 'PUT',
            headers: { 'Content-Type': fileType },
            body: buffer,
        });
        if (!putRes.ok) {
            const text = await putRes.text().catch(() => '');
            throw new Error(`R2 PUT failed: ${putRes.status} ${putRes.statusText} ${text}`);
        }
        // Upload thumbnail
        const thumbCmd = new client_s3_1.PutObjectCommand({
            Bucket: bucketName,
            Key: thumbnailKey,
            ContentType: 'image/jpeg',
        });
        const thumbPresigned = await (0, s3_request_presigner_1.getSignedUrl)(client, thumbCmd, { expiresIn: 900 });
        const thumbRes = await fetch(thumbPresigned, {
            method: 'PUT',
            headers: { 'Content-Type': 'image/jpeg' },
            body: new Uint8Array(thumbnailBuffer),
        });
        if (!thumbRes.ok) {
            const text = await thumbRes.text().catch(() => '');
            throw new Error(`Thumbnail upload failed: ${thumbRes.status} ${thumbRes.statusText} ${text}`);
        }
        // Public URL via r2.dev (already set to Public Access in dashboard)
        const publicUrl = `https://pub-977a7d4b63c4438980570a32245b687b.r2.dev/${key}`;
        const thumbnailUrl = `https://pub-977a7d4b63c4438980570a32245b687b.r2.dev/${thumbnailKey}`;
        return {
            key,
            publicUrl,
            thumbnailUrl,
            width: metadata.width || 0,
            height: metadata.height || 0,
            aspectRatio,
            averageColor,
        };
    }
    catch (error) {
        // Add structured logging to aid debugging of header issues without leaking secrets
        console.error('Error uploading to R2', {
            message: error === null || error === void 0 ? void 0 : error.message,
            name: error === null || error === void 0 ? void 0 : error.name,
            stack: (_a = error === null || error === void 0 ? void 0 : error.stack) === null || _a === void 0 ? void 0 : _a.split('\n').slice(0, 5).join('\n'),
            code: (_b = error === null || error === void 0 ? void 0 : error.$metadata) === null || _b === void 0 ? void 0 : _b.httpStatusCode,
        });
        throw new functions.https.HttpsError('internal', 'Failed to upload to R2', (error === null || error === void 0 ? void 0 : error.message) || JSON.stringify(error));
    }
});
/**
 * Generate a presigned URL for uploading files to R2 (alternative method)
 */
exports.getUploadUrl = functions
    .runWith({
    secrets: [r2AccessKeyId, r2SecretAccessKey, r2AccountId, r2BucketName]
})
    .https.onCall(async (data, context) => {
    var _a;
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
        const accessKeyId = r2AccessKeyId.value().trim();
        const secretAccessKey = r2SecretAccessKey.value().trim();
        const accountId = r2AccountId.value().trim();
        const bucketName = r2BucketName.value().trim();
        // Configure R2 client (S3-compatible)
        const s3Client = new client_s3_1.S3Client({
            region: 'auto',
            endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
            forcePathStyle: true,
            credentials: {
                accessKeyId,
                secretAccessKey,
            },
        });
        // Create presigned URL for PUT operation (ContentType included so client MUST send identical header)
        const command = new client_s3_1.PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            ContentType: fileType,
        });
        const uploadUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3Client, command, { expiresIn: 3600 }); // 1 hour
        const publicUrl = `https://pub-977a7d4b63c4438980570a32245b687b.r2.dev/${key}`;
        return { uploadUrl, key, publicUrl, requiredHeaders: { 'Content-Type': fileType } };
    }
    catch (error) {
        console.error('Error generating upload URL', {
            message: error === null || error === void 0 ? void 0 : error.message,
            name: error === null || error === void 0 ? void 0 : error.name,
            stack: (_a = error === null || error === void 0 ? void 0 : error.stack) === null || _a === void 0 ? void 0 : _a.split('\n').slice(0, 5).join('\n'),
        });
        throw new functions.https.HttpsError('internal', 'Failed to generate upload URL', error.message);
    }
});
/**
 * Process new content when it's added to Firestore
 * Automatically trigger image tagging
 */
exports.processContent = functions
    .runWith({ secrets: [anthropicApiKey] })
    .firestore
    .document('items/{itemId}')
    .onCreate(async (snap, context) => {
    const data = snap.data();
    const itemId = context.params.itemId;
    console.log('Processing new content:', data.title, itemId);
    // If it's an image, automatically generate tags
    if (data.type === 'image' && data.url) {
        let retryCount = 0;
        const maxRetries = 2;
        while (retryCount <= maxRetries) {
            try {
                console.log(`Auto-tagging image (attempt ${retryCount + 1}/${maxRetries + 1}):`, data.url);
                // Call the generateImageTags function internally
                // Note: In production, you might want to use a task queue
                const anthropic = new sdk_1.default({
                    apiKey: anthropicApiKey.value(),
                });
                const imageResponse = await fetch(data.url);
                if (!imageResponse.ok) {
                    throw new Error(`Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`);
                }
                const imageArrayBuffer = await imageResponse.arrayBuffer();
                const originalSizeMB = imageArrayBuffer.byteLength / 1024 / 1024;
                console.log(`Original image size: ${originalSizeMB.toFixed(2)}MB`);
                // Claude has a 5MB base64 limit. Base64 adds ~33% overhead.
                // So we need to keep the raw image under ~3.75MB to be safe
                const maxRawSizeMB = 3.5;
                let imageBuffer;
                let mediaType = data.fileType || 'image/jpeg';
                if (originalSizeMB > maxRawSizeMB) {
                    console.log(`Image too large for Claude, resizing from ${originalSizeMB.toFixed(2)}MB...`);
                    // Resize to fit within Claude's limits
                    imageBuffer = await (0, sharp_1.default)(Buffer.from(imageArrayBuffer))
                        .rotate() // Preserve orientation
                        .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
                        .jpeg({ quality: 85 })
                        .toBuffer();
                    const resizedSizeMB = imageBuffer.byteLength / 1024 / 1024;
                    console.log(`Resized to ${resizedSizeMB.toFixed(2)}MB`);
                    // Since we converted to JPEG, update the media type
                    mediaType = 'image/jpeg';
                }
                else {
                    imageBuffer = Buffer.from(imageArrayBuffer);
                }
                const base64Image = imageBuffer.toString('base64');
                const base64SizeMB = base64Image.length / 1024 / 1024;
                console.log(`Base64 size: ${base64SizeMB.toFixed(2)}MB`);
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
                                        media_type: mediaType,
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
                        break; // Success! Exit retry loop
                    }
                    else {
                        throw new Error('No JSON found in Claude response');
                    }
                }
                else {
                    throw new Error('Unexpected response type from Claude');
                }
            }
            catch (error) {
                retryCount++;
                console.error(`Error auto-tagging image (attempt ${retryCount}/${maxRetries + 1}):`, {
                    itemId,
                    url: data.url,
                    error: error.message,
                    stack: error.stack,
                });
                if (retryCount > maxRetries) {
                    // Mark as failed in Firestore so we know it needs manual review
                    await snap.ref.update({
                        aiProcessingFailed: true,
                        aiProcessingError: error.message,
                        processedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    console.error('Failed to auto-tag image after all retries:', itemId);
                }
                else {
                    // Wait before retry (exponential backoff)
                    await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                }
            }
        }
    }
    return null;
});
/**
 * Delete item from R2 storage
 */
exports.deleteFromR2 = functions
    .runWith({ secrets: [r2AccountId, r2AccessKeyId, r2SecretAccessKey, r2BucketName] })
    .https.onCall(async (data, context) => {
    // Verify authentication
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    try {
        const userId = context.auth.uid;
        const { url } = data;
        // Extract key from URL
        const urlObj = new URL(url);
        const key = urlObj.pathname.substring(1); // Remove leading slash
        console.log('Deleting from R2:', { userId, key });
        const accountId = r2AccountId.value().trim();
        const accessKeyId = r2AccessKeyId.value().trim();
        const secretAccessKey = r2SecretAccessKey.value().trim();
        const bucketName = r2BucketName.value().trim();
        const client = new client_s3_1.S3Client({
            region: 'auto',
            endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId,
                secretAccessKey,
            },
        });
        // Delete original image
        const deleteCmd = new client_s3_1.DeleteObjectCommand({
            Bucket: bucketName,
            Key: key,
        });
        await client.send(deleteCmd);
        // Delete thumbnail if it exists (ignore errors if it doesn't)
        try {
            const thumbnailKey = `${key.replace(/\.[^.]+$/, '')}_thumb.jpg`;
            const deleteThumbnailCmd = new client_s3_1.DeleteObjectCommand({
                Bucket: bucketName,
                Key: thumbnailKey,
            });
            await client.send(deleteThumbnailCmd);
            console.log('Deleted thumbnail:', thumbnailKey);
        }
        catch (thumbError) {
            console.log('Thumbnail not found or already deleted, continuing...');
        }
        console.log('Deleted from R2:', key);
        return { success: true };
    }
    catch (error) {
        console.error('Error deleting from R2:', error);
        throw new functions.https.HttpsError('internal', 'Failed to delete from R2', error.message);
    }
});
/**
 * Generate tags for an image using Claude Haiku
 * Call this from the client with image URL
 */
exports.generateImageTags = functions
    .runWith({ secrets: [anthropicApiKey] })
    .https.onCall(async (data, context) => {
    // Verify authentication
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { imageUrl, imageType = 'image/jpeg' } = data;
    try {
        // Initialize Anthropic client with the secret API key
        const anthropic = new sdk_1.default({
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
    }
    catch (error) {
        console.error('Error generating tags:', error);
        throw new functions.https.HttpsError('internal', 'Failed to generate tags', error.message);
    }
});
/**
 * Backfill average colors for existing images
 * This can be called manually to update images that were uploaded before color extraction was added
 */
exports.backfillImageColors = functions
    .runWith({
    timeoutSeconds: 540,
    memory: '1GB',
})
    .https.onCall(async (data, context) => {
    // Require authentication
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const batchSize = data.batchSize || 50;
    const userId = context.auth.uid;
    try {
        // Get images without averageColor for this user
        const itemsSnapshot = await admin.firestore()
            .collection('items')
            .where('userId', '==', userId)
            .where('type', '==', 'image')
            .limit(batchSize)
            .get();
        const updates = [];
        let processed = 0;
        let skipped = 0;
        let errors = 0;
        for (const doc of itemsSnapshot.docs) {
            const item = doc.data();
            // Skip if already has color
            if (item.averageColor) {
                skipped++;
                continue;
            }
            // Skip if no URL
            if (!item.url) {
                skipped++;
                continue;
            }
            try {
                // Fetch the image
                const imageResponse = await fetch(item.url);
                if (!imageResponse.ok) {
                    console.error(`Failed to fetch image ${doc.id}: ${imageResponse.status}`);
                    errors++;
                    continue;
                }
                const imageArrayBuffer = await imageResponse.arrayBuffer();
                // Extract average color
                const colorData = await (0, sharp_1.default)(Buffer.from(imageArrayBuffer))
                    .resize(100, 100, { fit: 'cover' })
                    .raw()
                    .toBuffer({ resolveWithObject: true });
                const pixels = colorData.data;
                let r = 0, g = 0, b = 0;
                const pixelCount = pixels.length / 3;
                for (let i = 0; i < pixels.length; i += 3) {
                    r += pixels[i];
                    g += pixels[i + 1];
                    b += pixels[i + 2];
                }
                const averageColor = [
                    Math.round(r / pixelCount),
                    Math.round(g / pixelCount),
                    Math.round(b / pixelCount),
                ];
                // Update Firestore
                updates.push(doc.ref.update({
                    averageColor,
                    updated_at: admin.firestore.FieldValue.serverTimestamp(),
                }));
                processed++;
                console.log(`Processed ${doc.id}: RGB(${averageColor.join(', ')})`);
            }
            catch (error) {
                console.error(`Error processing ${doc.id}:`, error.message);
                errors++;
            }
        }
        // Wait for all updates to complete
        await Promise.all(updates);
        return {
            success: true,
            processed,
            skipped,
            errors,
            total: itemsSnapshot.size,
        };
    }
    catch (error) {
        console.error('Error backfilling colors:', error);
        throw new functions.https.HttpsError('internal', 'Failed to backfill colors', error.message);
    }
});
/**
 * Backfill collection references for existing items
 * This updates items to have collectionId and collection_ids based on the collections that reference them
 */
exports.backfillCollectionReferences = functions
    .runWith({
    timeoutSeconds: 540,
    memory: '512MB',
})
    .https.onCall(async (data, context) => {
    // Require authentication (admin can backfill for specific user, users can backfill their own)
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const targetUserId = data.userId || context.auth.uid;
    try {
        // Get all collections for this user
        const collectionsSnapshot = await admin.firestore()
            .collection('collections')
            .where('userId', '==', targetUserId)
            .get();
        console.log(`Found ${collectionsSnapshot.size} collections for user ${targetUserId}`);
        let itemsUpdated = 0;
        let itemsSkipped = 0;
        let errors = 0;
        // For each collection, update its items
        for (const collectionDoc of collectionsSnapshot.docs) {
            const collection = collectionDoc.data();
            const collectionId = collectionDoc.id;
            const collectionName = collection.name;
            const itemIds = collection.item_ids || [];
            console.log(`Processing collection "${collectionName}" (${collectionId}) with ${itemIds.length} items`);
            // Update each item in the collection
            for (const itemId of itemIds) {
                try {
                    const itemRef = admin.firestore().collection('items').doc(itemId);
                    const itemDoc = await itemRef.get();
                    if (!itemDoc.exists) {
                        console.warn(`Item ${itemId} not found, skipping`);
                        itemsSkipped++;
                        continue;
                    }
                    const itemData = itemDoc.data();
                    // Check if already has this collection
                    const existingCollections = itemData.collection_ids || [];
                    if (existingCollections.includes(collectionId)) {
                        console.log(`Item ${itemId} already has collection ${collectionId}, skipping`);
                        itemsSkipped++;
                        continue;
                    }
                    // Update item with collection reference
                    const updates = {
                        collection_ids: admin.firestore.FieldValue.arrayUnion(collectionId),
                        updated_at: admin.firestore.FieldValue.serverTimestamp(),
                    };
                    // If item doesn't have a primary collection, set this as primary
                    if (!itemData.collectionId) {
                        updates.collectionId = collectionId;
                    }
                    // Add collection name as tag if not already present
                    const existingTags = itemData.tags || [];
                    if (!existingTags.includes(collectionName)) {
                        updates.tags = admin.firestore.FieldValue.arrayUnion(collectionName);
                    }
                    await itemRef.update(updates);
                    console.log(`Updated item ${itemId} with collection ${collectionId}`);
                    itemsUpdated++;
                }
                catch (error) {
                    console.error(`Error updating item ${itemId}:`, error.message);
                    errors++;
                }
            }
        }
        return {
            success: true,
            collectionsProcessed: collectionsSnapshot.size,
            itemsUpdated,
            itemsSkipped,
            errors,
        };
    }
    catch (error) {
        console.error('Error backfilling collection references:', error);
        throw new functions.https.HttpsError('internal', 'Failed to backfill collection references', error.message);
    }
});
/**
 * Fetch text content from Firebase Storage (bypasses CORS)
 */
exports.getTextContent = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { storagePath } = data;
    // Verify the user owns this file
    const userId = context.auth.uid;
    if (!storagePath.startsWith(`text-items/${userId}/`)) {
        throw new functions.https.HttpsError('permission-denied', 'Access denied to this file');
    }
    try {
        const bucket = admin.storage().bucket();
        const file = bucket.file(storagePath);
        // Download the file
        const [contents] = await file.download();
        const jsonData = JSON.parse(contents.toString('utf-8'));
        return { success: true, data: jsonData };
    }
    catch (error) {
        console.error('Error fetching text content:', error);
        throw new functions.https.HttpsError('internal', 'Failed to fetch text content', error.message);
    }
});
//# sourceMappingURL=index.js.map