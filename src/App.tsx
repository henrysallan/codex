import { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import GraphView from './components/GraphView';
import CommandPalette from './components/search/CommandPalette';
import ItemSidebar from './components/ItemSidebar';
import { onAuthChange, signInWithGoogle, signOut } from './lib/auth';
import { db } from './lib/firebase';
import { applyDensityAdaptiveScaling } from './lib/umap';
import { generateSimilarityBasedLayout } from './lib/similarityLayout';
import type { ContentItem, Collection } from './types';
import type { User } from 'firebase/auth';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [itemsWithCoords, setItemsWithCoords] = useState<ContentItem[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const cameraControlsRef = useRef<any>(null);

  // Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthChange((currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Fetch user's items from Firestore
  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }

    const itemsQuery = query(
      collection(db, 'items'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(
      itemsQuery,
      (snapshot) => {
        const newItems: ContentItem[] = [];
        snapshot.forEach((doc) => {
          newItems.push({ id: doc.id, ...doc.data() } as ContentItem);
        });
        console.log('Fetched items:', newItems);
        console.log('Items with embeddings:', newItems.filter(i => i.embedding).length);
        console.log('Sample item:', newItems[0]);
        setItems(newItems);
      },
      (error) => {
        console.error('Error fetching items:', error);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Generate embeddings for items that don't have them
  // DISABLED: Client-side embedding generation has issues with TensorFlow.js in browser
  // TODO: Move embedding generation to server-side (Firebase Functions)
  useEffect(() => {
    console.log('Client-side embedding generation is disabled. Embeddings should be generated server-side.');
  }, []);

  // Calculate coordinates for items based on weighted similarity
  useEffect(() => {
    if (items.length === 0) {
      setItemsWithCoords([]);
      return;
    }

    console.log(`Positioning ${items.length} items based on collection clustering and tag similarity`);

    // Generate collection-centric layout: collections positioned in tight spiral, items cluster within
    const coords2D = generateSimilarityBasedLayout(items);

    // Apply minimal density-adaptive scaling to maintain the tight clustering
    const scaledCoords = applyDensityAdaptiveScaling(
      coords2D,
      10,  // densityRadius - smaller radius since collections are already close
      0.7  // compressionFactor - less compression to maintain spiral structure
    );

    // Apply coordinates to items
    const updatedItems = items.map((item, i) => ({
      ...item,
      umap_coords: {
        x: scaledCoords[i].x,
        y: scaledCoords[i].y,
        z: 0,
      }
    }));

    console.log('Items with similarity-based coords:', updatedItems.filter(i => i.umap_coords).length);
    setItemsWithCoords(updatedItems);
  }, [items]);

  // Fetch user's collections from Firestore
  useEffect(() => {
    if (!user) {
      setCollections([]);
      return;
    }

    const collectionsQuery = query(
      collection(db, 'collections'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(
      collectionsQuery,
      (snapshot) => {
        const newCollections: Collection[] = [];
        snapshot.forEach((doc) => {
          newCollections.push({ id: doc.id, ...doc.data() } as Collection);
        });
        console.log('Fetched collections:', newCollections);
        setCollections(newCollections);
      },
      (error) => {
        console.error('Error fetching collections:', error);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelectItem = (item: ContentItem) => {
    setSelectedItem(item);
    setCommandPaletteOpen(false);
    
    // Focus the camera on the item's position
    if (item.umap_coords && cameraControlsRef.current) {
      cameraControlsRef.current.focusOn({
        x: item.umap_coords.x,
        y: item.umap_coords.y,
        z: item.umap_coords.z || 0
      });
    }
  };

  const handleFocusItem = (item: ContentItem, position: { x: number; y: number; z: number }) => {
    setSelectedItem(item);
    // Camera animation will be handled in GraphView
    if (cameraControlsRef.current) {
      cameraControlsRef.current.focusOn(position);
    }
  };

  const handleCloseSidebar = () => {
    setSelectedItem(null);
  };

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Sign in failed:', error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setSelectedItem(null);
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  // Show sign-in page if not authenticated
  if (!user && !loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-md w-full">
          <h1 className="text-4xl font-bold text-center mb-2">codex</h1>
          <p className="text-gray-600 text-center mb-8">
            Your visual knowledge graph
          </p>
          <button
            onClick={handleSignIn}
            className="w-full bg-white border-2 border-gray-200 text-gray-700 font-semibold py-3 px-6 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  // Show loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-2xl text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-background">
      {/* User menu */}
      <div className="fixed top-2 sm:top-4 right-2 sm:right-4 z-50">
        <div className="flex items-center gap-2 sm:gap-3 bg-white/80 backdrop-blur-xl rounded-full px-3 sm:px-4 py-1.5 sm:py-2 shadow-lg border border-gray-200">
          <img
            src={user?.photoURL || ''}
            alt={user?.displayName || 'User'}
            className="w-6 h-6 sm:w-8 sm:h-8 rounded-full"
          />
          <span className="text-xs sm:text-sm font-medium hidden sm:inline">{user?.displayName}</span>
          <button
            onClick={handleSignOut}
            className="text-xs sm:text-sm text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="fixed top-2 sm:top-4 left-2 sm:left-1/2 right-20 sm:right-auto sm:-translate-x-1/2 sm:w-[600px] z-50">
        <div
          className="bg-white/80 backdrop-blur-xl rounded-xl sm:rounded-2xl shadow-2xl border border-gray-200 cursor-pointer"
          onClick={() => setCommandPaletteOpen(true)}
        >
          <div className="px-4 sm:px-6 py-3 sm:py-4 text-sm sm:text-lg text-gray-400">
            <span className="hidden sm:inline">Search anything... ⌘K</span>
            <span className="sm:hidden">Search... ⌘K</span>
          </div>
        </div>
      </div>

      {/* Graph Visualization */}
      <GraphView
        items={itemsWithCoords}
        onFocusItem={handleFocusItem}
        cameraControlsRef={cameraControlsRef}
        focusedItemId={selectedItem?.id || null}
      />

      {/* Command Palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        items={itemsWithCoords}
        collections={collections}
        onSelectItem={handleSelectItem}
      />

      {/* Item Sidebar */}
      <ItemSidebar 
        item={selectedItem} 
        onClose={handleCloseSidebar}
        collections={collections}
      />

      {/* Sidebar (TODO) - Removed old implementation */}
    </div>
  );
}

export default App;
