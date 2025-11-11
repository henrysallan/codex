# Thumbnail Generation Added 📸

Thumbnails are now generated automatically for all uploaded images!

## What Changed

### Backend (Cloud Functions)

**uploadToR2 function** now:
1. Receives the original image as base64
2. Uses Sharp library to generate a 256x256 thumbnail:
   - Resizes to 256x256 with cover fit (centered crop)
   - Converts to JPEG with 80% quality for optimal size
   - Names thumbnail as `{original}_thumb.jpg`
3. Uploads both original and thumbnail to R2
4. Returns both `publicUrl` and `thumbnailUrl`

**Dependencies added:**
- `sharp` - Fast server-side image processing library

### Frontend (React)

**GraphNode.tsx** now:
- Uses `useLoader(TextureLoader, thumbnailUrl)` to load image textures
- Renders images as `<sprite>` billboards (always face camera) instead of spheres
- Scale: 5x5 units (6x6 on hover)
- Fallback to colored sphere if:
  - No thumbnail URL exists
  - Texture fails to load
  - Item is not an image type

**CommandPalette.tsx** updated:
- Saves `thumbnail_url` to Firestore when creating new items
- Expects `thumbnailUrl` in uploadToR2 response

### Visual Result

Images now appear as actual image previews in the 3D graph instead of generic colored dots. They:
- Always face the camera (billboard effect)
- Scale up slightly on hover (5→6 units)
- Show as actual image content
- Load asynchronously with Three.js TextureLoader

## File Structure in R2

```
uploads/{userId}/{timestamp}-{filename}.jpg         # Original image
uploads/{userId}/{timestamp}-{filename}_thumb.jpg   # 256x256 thumbnail
```

## Data Flow

1. User uploads image via command palette
2. `uploadToR2` function:
   - Generates 256x256 thumbnail
   - Uploads original → R2
   - Uploads thumbnail → R2
   - Returns both URLs
3. Firestore doc created with `thumbnail_url` field
4. GraphNode loads thumbnail texture
5. Renders as sprite in 3D space

## Performance

- Thumbnails are ~10-30KB (JPEG 80% quality)
- Original images remain full quality
- TextureLoader caches textures automatically
- Async loading doesn't block rendering
- Fallback sphere shows during load

## Try It

1. Go to https://codex-1163f.web.app
2. Press `⌘K` → "Upload Image"
3. Upload a new image
4. Watch it appear as an actual image preview in the graph!

Your existing 2 nodes will show as spheres (no thumbnails yet). New uploads will display as image previews.

---

**Status:** Live in Production ✨
