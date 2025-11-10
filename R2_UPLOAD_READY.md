# R2 Upload Pipeline - Setup Complete! 🚀

## ✅ What's Been Set Up

### Cloud Functions Deployed
1. **`getUploadUrl`** - Generates presigned R2 upload URLs
2. **`processContent`** - Auto-triggers when images are added to Firestore
3. **`generateImageTags`** - AI tagging with Claude Haiku
4. **`healthCheck`** - Health check endpoint

### R2 Configuration
- ✅ Bucket created: `codex-data`
- ✅ CORS configured
- ✅ API credentials stored in Firebase Secrets
- ⚠️ **IMPORTANT**: Need to enable public access (see below)

## 🧪 Test the Upload

**Visit**: https://codex-1163f.web.app/test-upload.html

This page lets you:
1. Select an image file
2. Upload it directly to Cloudflare R2
3. Auto-save metadata to Firestore
4. Trigger AI tagging automatically

## ⚠️ Required: Enable R2 Public Access

For the uploaded images to be publicly accessible, you need to:

### Option 1: Enable R2.dev Subdomain (Quick & Easy)
1. Go to https://dash.cloudflare.com/ → R2 → Your bucket (`codex-data`)
2. Click **Settings** tab
3. Under **Public Access**, click **Allow Access**
4. Click **Connect Domain** and choose **R2.dev subdomain**
5. Note the URL (something like `https://pub-{account-id}.r2.dev`)

### Option 2: Custom Domain (Production)
1. Go to bucket settings
2. Click **Connect Domain**
3. Choose **Custom Domains**
4. Enter your domain (e.g., `cdn.codex.com`)
5. Follow DNS setup instructions

## 🔄 How the Pipeline Works

```
User selects image
    ↓
[Upload Test Page]
    ↓
Call getUploadUrl() → Get presigned URL from Cloud Function
    ↓
Upload directly to R2 (bypasses Firebase)
    ↓
Save metadata to Firestore (items collection)
    ↓
[processContent Function] Auto-triggers on new document
    ↓
Fetch image from R2
    ↓
Send to Claude Haiku API
    ↓
Get AI-generated title, tags, description
    ↓
Update Firestore document with AI data
    ↓
✅ Complete!
```

## 📊 What Gets Saved to Firestore

```javascript
{
  type: 'image',
  title: 'filename.jpg',          // Original filename
  url: 'https://pub-xxx.r2.dev/uploads/...', // Public R2 URL
  key: 'uploads/userId/timestamp-filename.jpg', // R2 key
  fileType: 'image/jpeg',
  size: 12345,                    // File size in bytes
  createdAt: Timestamp,
  userId: 'anonymous-user-id',
  
  // Added by processContent function (~10-20 seconds later):
  aiTitle: 'Mountain Landscape',  // AI-generated
  aiTags: ['mountain', 'nature', 'landscape', ...], // AI-generated
  aiDescription: 'A scenic mountain view...', // AI-generated
  processedAt: Timestamp
}
```

## 🔍 Debugging

### Check Function Logs
```bash
# All functions
firebase functions:log

# Specific function
firebase functions:log --only processContent
firebase functions:log --only getUploadUrl
```

### View in Firebase Console
- **Functions**: https://console.firebase.google.com/project/codex-1163f/functions
- **Firestore**: https://console.firebase.google.com/project/codex-1163f/firestore
- **Logs**: https://console.firebase.google.com/project/codex-1163f/functions/logs

### Common Issues

**❌ Image URL not accessible**
- Make sure you enabled public access in R2 settings
- Check CORS configuration

**❌ Upload fails**
- Verify Firebase secrets are set correctly
- Check function logs for errors

**❌ AI tagging doesn't happen**
- Wait 20-30 seconds (processContent is async)
- Check Firestore document for `processedAt` field
- View processContent logs

## 💰 Cost Estimates

### Cloudflare R2
- Storage: **$0.015/GB/month**
- Class A operations (uploads): **$4.50/million**
- Class B operations (downloads): **$0.36/million**
- **No egress fees!** 🎉

### Claude Haiku API
- ~$0.001-0.005 per image analysis
- Very cost-effective

### Firebase
- Cloud Functions: Free tier includes 2M invocations/month
- Firestore: Free tier includes 50K reads/20K writes per day

## 🎯 Next Steps

1. ✅ Enable R2 public access
2. 🧪 Test upload at: https://codex-1163f.web.app/test-upload.html
3. 🔍 Check Firestore after ~20 seconds to see AI tags
4. 🚀 Integrate upload into your main React app
5. 🎨 Build the UI for browsing/searching tagged images

---

**Ready to test!** Just enable R2 public access and try uploading an image! 🖼️
