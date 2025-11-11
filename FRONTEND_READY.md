# Frontend Ready 🎉

The main Codex app is now live with the graph visualization interface!

## 🌐 Live URL
https://codex-1163f.web.app

## ✨ Features

### Authentication
- Google Sign-In on landing page
- User profile stored in Firestore
- Sign out button in top-right corner

### Graph Visualization
- React Three Fiber 3D canvas
- Interactive nodes representing your content
- OrbitControls for pan/zoom/rotate
- Nodes colored by content type:
  - 🔴 Red: Images
  - 🔵 Blue: PDFs
  - 🟢 Cyan: Text
  - 🟠 Orange: Links
- Spiral layout for items without UMAP coordinates

### Command Palette
- Open with `⌘K` (Mac) or `Ctrl+K` (Windows/Linux)
- Click search bar at top to open
- Search through all your items
- View recent items
- Quick actions:
  - **📤 Upload Image** - Upload and auto-tag with Claude
  - 📝 New Note (coming soon)
  - 📁 Create Collection (coming soon)

### Upload Flow
1. Press `⌘K` to open command palette
2. Select "Upload Image"
3. Choose an image file
4. File uploads to Cloudflare R2
5. Firestore document created
6. `processContent` trigger fires automatically
7. Claude Haiku analyzes the image
8. AI-generated title, tags, and description added to document
9. New node appears in graph view

## 🏗️ Architecture

### Frontend (`src/`)
- **App.tsx** - Main app with auth wrapper, graph view, and command palette
- **components/GraphView.tsx** - Three.js canvas wrapper
- **components/graph/GraphNodes.tsx** - Renders all nodes
- **components/graph/GraphNode.tsx** - Individual node with hover effects
- **components/search/CommandPalette.tsx** - Search + actions UI with upload integration
- **lib/auth.ts** - Google auth helpers
- **lib/firebase.ts** - Firebase client config

### Data Flow
1. User authenticates → profile saved to `users/{uid}`
2. App fetches items where `userId == currentUser.uid`
3. Items rendered as nodes in 3D space
4. Real-time updates via Firestore `onSnapshot`
5. Upload creates item → triggers auto-tagging → updates propagate to UI

### Firestore Structure
```
users/{uid}
  - email, displayName, photoURL
  - createdAt, lastLoginAt

items/{itemId}
  - type, title, url
  - userId (owner)
  - tags, folder_ids, collection_ids
  - aiTitle, aiTags, aiDescription (from Claude)
  - umap_coords (x, y, z for positioning)
  - created_at, updated_at, accessed_at
```

## 🔧 Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **3D Graphics**: Three.js, React Three Fiber, Drei
- **UI**: Tailwind CSS, cmdk (command palette)
- **Backend**: Firebase (Hosting, Firestore, Auth, Functions)
- **Storage**: Cloudflare R2 (S3-compatible)
- **AI**: Anthropic Claude-3 Haiku

## 🎯 What Works Now

✅ Google authentication with user profiles  
✅ 3D graph visualization of content  
✅ Command palette with keyboard shortcut  
✅ Image upload to R2  
✅ Automatic AI tagging with Claude  
✅ Real-time Firestore sync  
✅ Node hover effects and click handlers  
✅ Responsive search and filtering  

## 🚀 Next Steps

- Implement camera zoom to selected node
- Add sidebar with item details
- UMAP embedding generation for better clustering
- Physics-based node attraction/repulsion
- Link visualization between related items
- Text note creation
- PDF upload and OCR
- Web link saving with metadata extraction
- Collections and folders UI
- Semantic search with embeddings

## 🛠️ Development

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build

# Deploy to Firebase
firebase deploy --only hosting
```

## 📝 Notes

- Items without `umap_coords` are arranged in a spiral pattern
- Upload state shows loading spinner during upload
- Auto-tagging happens in background via `processContent` trigger
- Graph updates in real-time when new items are added
- All user data is scoped by `userId` for privacy

---

**Created:** November 10, 2025  
**Status:** Production Ready 🚀
