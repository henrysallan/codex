# API Keys & Secrets Setup Guide

This guide explains how to securely configure API keys for Codex using Firebase Functions Secrets.

## ⚠️ Important Security Notes

**NEVER commit API keys to GitHub!**
- ✅ Use Firebase Functions Secrets for Cloud Functions
- ✅ Use `.env` (gitignored) for local development only
- ❌ Never hardcode API keys in source code
- ❌ Never commit `.env` files

## Prerequisites

Your Firebase project must be on the **Blaze (pay-as-you-go)** plan to use Functions Secrets.

**To upgrade:**
1. Visit: https://console.firebase.google.com/project/codex-1163f/usage/details
2. Click "Modify Plan" or "Upgrade"
3. Select "Blaze (pay-as-you-go)"
4. Add billing information

**Don't worry about costs!** Firebase has generous free tiers that cover personal use.

## 1. Get Your API Keys

### Anthropic (Claude) API Key

1. Go to https://console.anthropic.com/settings/keys
2. Click "Create Key"
3. Give it a name (e.g., "Codex Production")
4. Copy the API key (starts with `sk-ant-...`)
5. **Save it securely** - you won't see it again!

### Cloudflare R2 Credentials (for later)

1. Log in to Cloudflare Dashboard
2. Go to R2 Object Storage
3. Click "Manage R2 API Tokens"
4. Create API token with:
   - Name: "Codex Upload"
   - Permissions: Object Read & Write
5. Copy:
   - Access Key ID
   - Secret Access Key
   - Bucket name

## 2. Set Up Firebase Secrets

### Set Anthropic API Key

```bash
cd /Users/henryallan/Documents/projects/codex
firebase functions:secrets:set ANTHROPIC_API_KEY
```

When prompted, paste your Anthropic API key.

### Set R2 Credentials (when ready)

```bash
firebase functions:secrets:set R2_ACCESS_KEY_ID
firebase functions:secrets:set R2_SECRET_ACCESS_KEY  
firebase functions:secrets:set R2_BUCKET_NAME
firebase functions:secrets:set R2_ACCOUNT_ID
```

## 3. Access Secrets in Functions

Secrets are automatically available to functions that declare them:

```typescript
import { defineSecret } from 'firebase-functions/params';

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

export const myFunction = functions
  .runWith({ secrets: [anthropicApiKey] })
  .https.onCall(async (data, context) => {
    // Access the secret value
    const apiKey = anthropicApiKey.value();
    
    // Use it safely
    const client = new Anthropic({ apiKey });
  });
```

## 4. View Configured Secrets

List all secrets:
```bash
firebase functions:secrets:access --list
```

View a specific secret (use carefully!):
```bash
firebase functions:secrets:access ANTHROPIC_API_KEY
```

## 5. Update or Delete Secrets

Update a secret:
```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
```

Delete a secret:
```bash
firebase functions:secrets:destroy ANTHROPIC_API_KEY
```

## 6. Deploy Functions with Secrets

When you deploy, Firebase automatically provisions the secrets:

```bash
cd /Users/henryallan/Documents/projects/codex
firebase deploy --only functions
```

## 7. Local Development

For local testing with Firebase emulators:

```bash
# Set local environment variable
export ANTHROPIC_API_KEY="sk-ant-your-key-here"

# Run emulators
firebase emulators:start
```

Or create a `.env.local` file in the `functions` directory:
```env
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

**Never commit `.env.local` to Git!**

## 8. Cost Monitoring

**Anthropic Claude Haiku Pricing:**
- Input: $0.25 per million tokens (~$0.0003 per image)
- Output: $1.25 per million tokens
- Extremely affordable for personal use!

**Firebase Functions:**
- 2 million invocations/month FREE
- $0.40 per million after that

Set up billing alerts:
1. Go to https://console.cloud.google.com/billing
2. Set budget alerts (e.g., $10/month)
3. Get email notifications

## 9. Security Best Practices

✅ **DO:**
- Use Firebase Secrets for production
- Rotate keys periodically
- Use different keys for dev/prod
- Monitor API usage
- Set up billing alerts

❌ **DON'T:**
- Commit secrets to Git
- Share secrets in chat/email
- Use production keys locally
- Hardcode API keys in code
- Leave unused keys active

## 10. Troubleshooting

**Error: "ANTHROPIC_API_KEY not defined"**
- Make sure you've set the secret: `firebase functions:secrets:set ANTHROPIC_API_KEY`
- Check it's in the function's secrets list: `.runWith({ secrets: [anthropicApiKey] })`

**Error: "Secret not found during deployment"**
- Ensure your project is on the Blaze plan
- Re-run the secrets:set command
- Try deploying again

**Error: "Invalid API key"**
- Verify the key is correct: `firebase functions:secrets:access ANTHROPIC_API_KEY`
- Regenerate the key in Anthropic Console
- Update the secret

## Quick Reference

```bash
# Set a secret
firebase functions:secrets:set SECRET_NAME

# List all secrets  
firebase functions:secrets:access --list

# View a secret value
firebase functions:secrets:access SECRET_NAME

# Deploy with secrets
firebase deploy --only functions

# Delete a secret
firebase functions:secrets:destroy SECRET_NAME
```

---

**Current Status:**
- ✅ Anthropic SDK installed
- ✅ Cloud Function code ready
- ⏳ Waiting for Blaze plan upgrade
- ⏳ Need to set ANTHROPIC_API_KEY secret
- ⏳ Need to deploy functions

**Next Steps:**
1. Upgrade to Blaze plan
2. Get Anthropic API key
3. Run: `firebase functions:secrets:set ANTHROPIC_API_KEY`
4. Deploy: `firebase deploy --only functions`
5. Test with an image!
