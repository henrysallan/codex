# Codex - Searchable Notebook App

A personal knowledge management system with AI-powered tagging, vector-based semantic search, and an interactive 3D graph visualization for exploring your content.

## Features

- 🎨 **Visual Graph Interface** - Navigate your knowledge through a 3D spatial graph powered by Three.js
- 🔍 **Semantic Search** - Find content by meaning, not just keywords, using vector embeddings
- 🤖 **AI-Powered Tagging** - Automatic content categorization and organization
- 📁 **Multi-format Support** - Store images, PDFs, text notes, and web links
- ⚡ **Real-time Sync** - Instant updates across devices with Firebase
- 🎯 **Command Palette** - Quick access to everything with ⌘K

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS + Radix UI
- **3D Graphics**: Three.js + React Three Fiber
- **Backend**: Firebase (Auth, Firestore, Cloud Functions)
- **Storage**: Cloudflare R2
- **AI/ML**: Transformers.js (client-side embeddings) + OpenAI API (tagging)

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Firebase account
- Cloudflare account (for R2 storage)
- OpenAI API key

### Installation

1. Clone the repository:
```bash
git clone https://github.com/henrysallan/codex.git
cd codex
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` and add your Firebase, R2, and OpenAI credentials.

4. Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## Firebase Setup

1. Create a new Firebase project at [console.firebase.google.com](https://console.firebase.google.com)

2. Enable the following services:
   - Authentication (Email/Password)
   - Firestore Database
   - Cloud Functions

3. Install Firebase CLI:
```bash
npm install -g firebase-tools
```

4. Login to Firebase:
```bash
firebase login
```

5. Initialize your project:
```bash
firebase init
```

Select:
- Firestore
- Functions
- Hosting

6. Deploy Firestore rules and indexes:
```bash
firebase deploy --only firestore
```

## Deployment

### Deploy to Firebase Hosting

1. Build the project:
```bash
npm run build
```

2. Deploy to Firebase:
```bash
firebase deploy
```

Your app will be live at `https://your-project.web.app`

## Cloudflare R2 Setup

1. Create an R2 bucket in the Cloudflare dashboard

2. Generate API credentials with read/write access

3. Configure CORS for your bucket to allow uploads from your domain

4. Add the R2 bucket URL to your `.env` file

5. Set up Cloud Functions for presigned URL generation (see `functions/` directory)

## Project Structure

```
codex/
├── src/
│   ├── components/      # React components
│   │   ├── graph/      # Three.js graph visualization
│   │   └── search/     # Command palette and search
│   ├── lib/            # Core utilities
│   │   ├── firebase.ts # Firebase configuration
│   │   ├── embeddings.ts # Vector embedding generation
│   │   ├── search.ts   # Semantic search logic
│   │   ├── physics.ts  # Graph physics simulation
│   │   └── umap.ts     # UMAP projection
│   ├── types/          # TypeScript type definitions
│   └── config/         # App configuration
├── functions/          # Firebase Cloud Functions
├── firestore.rules     # Firestore security rules
└── firebase.json       # Firebase configuration
```

## Development Roadmap

- [x] Project scaffolding
- [x] Basic graph visualization
- [x] Command palette
- [ ] File upload pipeline
- [ ] OCR processing
- [ ] AI tagging integration
- [ ] Semantic search implementation
- [ ] Physics-based graph layout
- [ ] Content sidebar
- [ ] Folder/collection management
- [ ] Mobile responsive design

## Contributing

This is a personal project, but suggestions and feedback are welcome! Feel free to open an issue.

## License

MIT License - see LICENSE file for details

