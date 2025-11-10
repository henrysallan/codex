# Deployment Guide

This guide will walk you through deploying Codex to Firebase Hosting and setting up Cloudflare R2.

## Prerequisites

- Firebase CLI installed: `npm install -g firebase-tools`
- A Firebase project created
- A Cloudflare account with R2 enabled

## Step 1: Firebase Project Setup

1. **Login to Firebase:**
```bash
firebase login
```

2. **Initialize your Firebase project:**
```bash
firebase init
```

When prompted, select:
- **Firestore**: Set up Firestore rules and indexes
- **Functions**: Deploy Cloud Functions
- **Hosting**: Host your web app

For Firestore:
- Use default file names (`firestore.rules` and `firestore.indexes.json`)

For Functions:
- Choose TypeScript
- Use `functions` directory
- Install dependencies now: Yes

For Hosting:
- Public directory: `dist`
- Single-page app: Yes
- Set up automatic builds: No

3. **Link to your Firebase project:**
```bash
firebase use --add
```

Select your project and give it an alias (e.g., "production")

## Step 2: Configure Environment Variables

1. **Copy the example file:**
```bash
cp .env.example .env
```

2. **Get Firebase config:**
   - Go to Firebase Console
   - Project Settings > General
   - Under "Your apps", select your web app
   - Copy the config values

3. **Update `.env` with your Firebase credentials:**
```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

## Step 3: Enable Firebase Services

### Authentication

1. Go to Firebase Console > Authentication
2. Click "Get Started"
3. Enable "Email/Password" provider

### Firestore Database

1. Go to Firebase Console > Firestore Database
2. Click "Create Database"
3. Start in **production mode**
4. Choose a location (preferably close to your users)

### Cloud Functions

1. Upgrade to Blaze plan (pay-as-you-go, free tier available)
2. Cloud Functions will be deployed in the next step

## Step 4: Deploy Firestore Rules

Deploy security rules and indexes:

```bash
firebase deploy --only firestore
```

This will deploy:
- `firestore.rules` - Security rules
- `firestore.indexes.json` - Database indexes

## Step 5: Deploy Cloud Functions

1. **Install function dependencies:**
```bash
cd functions
npm install
cd ..
```

2. **Deploy functions:**
```bash
firebase deploy --only functions
```

## Step 6: Build and Deploy Frontend

1. **Build the application:**
```bash
npm run build
```

2. **Deploy to Firebase Hosting:**
```bash
firebase deploy --only hosting
```

Your app will be live at: `https://your-project.web.app`

## Step 7: Cloudflare R2 Setup

### Create R2 Bucket

1. Log in to Cloudflare Dashboard
2. Go to R2 Object Storage
3. Click "Create bucket"
4. Name it (e.g., "codex-storage")
5. Choose a location

### Configure CORS

1. Go to your bucket settings
2. Add CORS policy:

```json
[
  {
    "AllowedOrigins": ["https://your-project.web.app"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

### Generate API Credentials

1. Go to R2 > Manage R2 API Tokens
2. Click "Create API token"
3. Give it a name (e.g., "Codex Upload")
4. Permissions: Object Read & Write
5. Save the credentials:
   - Access Key ID
   - Secret Access Key

### Update Cloud Function

Add R2 credentials to your Cloud Function:

```bash
firebase functions:secrets:set R2_ACCESS_KEY_ID
firebase functions:secrets:set R2_SECRET_ACCESS_KEY
firebase functions:secrets:set R2_BUCKET_NAME
```

### Update Environment Variables

Add to your `.env`:

```env
VITE_R2_BUCKET_URL=https://your-bucket.your-account.r2.cloudflarestorage.com
```

### Redeploy Functions

```bash
firebase deploy --only functions
```

## Step 8: OpenAI API Setup (Optional)

For AI-powered tagging:

1. Get an API key from [platform.openai.com](https://platform.openai.com)
2. Add to `.env`:
```env
VITE_OPENAI_API_KEY=sk-...
```

3. Rebuild and redeploy:
```bash
npm run build
firebase deploy --only hosting
```

## Continuous Deployment

### Option 1: Manual Deployment

Whenever you make changes:

```bash
npm run build
firebase deploy
```

### Option 2: GitHub Actions (Recommended)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Firebase

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.VITE_FIREBASE_PROJECT_ID }}
          VITE_FIREBASE_STORAGE_BUCKET: ${{ secrets.VITE_FIREBASE_STORAGE_BUCKET }}
          VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.VITE_FIREBASE_MESSAGING_SENDER_ID }}
          VITE_FIREBASE_APP_ID: ${{ secrets.VITE_FIREBASE_APP_ID }}
      
      - name: Deploy to Firebase
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: ${{ secrets.GITHUB_TOKEN }}
          firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          channelId: live
          projectId: your-project-id
```

Add secrets in GitHub repo settings.

## Monitoring

### Check Deployment Status

```bash
firebase hosting:sites:list
```

### View Logs

```bash
# Function logs
firebase functions:log

# Hosting logs (in Firebase Console)
```

### Test Your Deployment

1. Visit `https://your-project.web.app`
2. Create an account
3. Try uploading content
4. Test search functionality

## Troubleshooting

### Build Errors

```bash
npm run build
# Check for TypeScript or import errors
```

### Deployment Errors

```bash
firebase deploy --debug
```

### Function Errors

Check logs:
```bash
firebase functions:log --limit 100
```

### CORS Issues

Make sure your domain is in the R2 CORS configuration and Firebase hosting is deployed.

## Cost Optimization

- Firebase free tier is generous for personal use
- R2 has no egress fees (only storage)
- Monitor usage in dashboards
- Set up billing alerts

## Next Steps

1. Set up custom domain (Firebase Hosting settings)
2. Configure analytics
3. Set up monitoring and alerts
4. Add more Cloud Functions for processing
5. Implement OCR and AI tagging

---

Need help? Check the [Firebase documentation](https://firebase.google.com/docs) or [Cloudflare R2 docs](https://developers.cloudflare.com/r2/).
