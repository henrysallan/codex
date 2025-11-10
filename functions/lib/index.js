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
exports.generateImageTags = exports.healthCheck = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const params_1 = require("firebase-functions/params");
// Define secrets (they won't be in the code or GitHub)
const anthropicApiKey = (0, params_1.defineSecret)('ANTHROPIC_API_KEY');
admin.initializeApp();
/**
 * Health check endpoint
 */
exports.healthCheck = functions.https.onRequest((req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// TODO: Uncomment when R2 is set up
/*
export const getUploadUrl = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  const { fileName, fileType } = data;
  const userId = context.auth.uid;
  // TODO: Implement R2 presigned URL generation
  return {
    url: 'https://placeholder-url.com',
    key: `uploads/${userId}/${Date.now()}-${fileName}`,
  };
});

export const processContent = functions.firestore
  .document('items/{itemId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    console.log('Processing new content:', data.title);
    // TODO: Implement processing pipeline
    return null;
  });
*/
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
//# sourceMappingURL=index.js.map