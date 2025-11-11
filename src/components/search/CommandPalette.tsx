import { useState, useRef, useMemo, useEffect } from 'react';
import { Command } from 'cmdk';
import { httpsCallable } from 'firebase/functions';
import { doc, setDoc, serverTimestamp, updateDoc, arrayUnion } from 'firebase/firestore';
import { ref, uploadString } from 'firebase/storage';
import { functions, db, auth, storage } from '../../lib/firebase';
import type { ContentItem, Collection } from '../../types';
import imageCompression from 'browser-image-compression';
import { generateEmbedding, cosineSimilarity } from '../../lib/embeddings';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ContentItem[];
  collections: Collection[];
  onSelectItem: (item: ContentItem) => void;
}

export default function CommandPalette({
  open,
  onOpenChange,
  items,
  collections,
  onSelectItem,
}: CommandPaletteProps) {
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; fileName: string } | null>(null);
  const [showCollectionDialog, setShowCollectionDialog] = useState(false);
  const [collectionName, setCollectionName] = useState('');
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]); // Array of collection IDs
  const [currentCollectionId, setCurrentCollectionId] = useState<string | null>(null); // Kept for backwards compat
  const [filteredCollections, setFilteredCollections] = useState<Collection[]>([]);
  const [searchEmbedding, setSearchEmbedding] = useState<number[] | null>(null);
  const [semanticResults, setSemanticResults] = useState<ContentItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const collectionFileInputRef = useRef<HTMLInputElement>(null);
  const [showTextItemDialog, setShowTextItemDialog] = useState(false);
  const [textItemTitle, setTextItemTitle] = useState('');

  // Generate embedding for search query (debounced)
  useEffect(() => {
    if (search.trim().length < 2) {
      setSearchEmbedding(null);
      setSemanticResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        console.log('🔍 Generating embedding for search:', search);
        const embedding = await generateEmbedding(search);
        console.log('✅ Search embedding generated:', embedding.slice(0, 5), '... (384 dims)');
        setSearchEmbedding(embedding);
      } catch (error) {
        console.error('Failed to generate search embedding:', error);
        setSearchEmbedding(null);
      }
    }, 300); // Debounce 300ms

    return () => clearTimeout(timeoutId);
  }, [search]);

  // Perform semantic search when embedding is ready
  useEffect(() => {
    if (!searchEmbedding || !items.length) {
      setSemanticResults([]);
      return;
    }

    console.log('🧠 Starting semantic search across', items.length, 'items');

    const performSemanticSearch = async () => {
      const matches: Array<{item: ContentItem, similarity: number}> = [];
      let itemsWithEmbeddings = 0;
      let itemsWithoutEmbeddings = 0;
      
      for (const item of items) {
        // If item has a pre-computed embedding, use it
        if (item.embedding && item.embedding.length > 0) {
          itemsWithEmbeddings++;
          const similarity = cosineSimilarity(searchEmbedding, item.embedding);
          if (similarity > 0.28) { // Threshold for semantic matching
            console.log(`   📊 Match: "${item.title}" similarity=${similarity.toFixed(3)}`);
            matches.push({ item, similarity });
          }
        } else {
          itemsWithoutEmbeddings++;
          // Fallback: generate embedding from item's text content
          const itemText = [
            item.title,
            item.aiTitle,
            item.aiDescription,
            ...(item.aiTags || []),
            ...(item.tags || [])
          ].filter(Boolean).join(' ');
          
          if (itemText.trim()) {
            try {
              const itemEmbedding = await generateEmbedding(itemText);
              const similarity = cosineSimilarity(searchEmbedding, itemEmbedding);
              if (similarity > 0.28) { // Threshold for semantic matching
                console.log(`   📊 Match (no pre-computed): "${item.title}" similarity=${similarity.toFixed(3)}`);
                matches.push({ item, similarity });
              }
            } catch (error) {
              console.error('Error generating item embedding:', error);
            }
          }
        }
      }
      
      console.log(`✅ Semantic search complete: ${matches.length} matches found`);
      console.log(`   Items with embeddings: ${itemsWithEmbeddings}`);
      console.log(`   Items without embeddings: ${itemsWithoutEmbeddings}`);
      
      // Sort by similarity descending
      const sorted = matches.sort((a, b) => b.similarity - a.similarity).map(m => m.item);
      setSemanticResults(sorted);
    };

    performSemanticSearch();
  }, [searchEmbedding, items]);

  const handleBackfillCollections = async () => {
    if (!confirm('This will update all your items with their collection references. Continue?')) {
      return;
    }

    try {
      const backfill = httpsCallable(functions, 'backfillCollectionReferences');
      const result = await backfill({});
      const data = result.data as any;
      alert(`Backfill complete!\nCollections: ${data.collectionsProcessed}\nItems Updated: ${data.itemsUpdated}\nSkipped: ${data.itemsSkipped}\nErrors: ${data.errors}`);
      console.log('Backfill result:', data);
    } catch (error) {
      console.error('Backfill failed:', error);
      alert('Backfill failed. Check console for details.');
    }
  };

  const handleBackfillColors = async () => {
    if (!confirm('This will extract colors from all your images. Continue?')) {
      return;
    }

    try {
      const backfill = httpsCallable(functions, 'backfillImageColors');
      const result = await backfill({ batchSize: 50 });
      const data = result.data as any;
      alert(`Color backfill complete!\nProcessed: ${data.processed}\nSkipped: ${data.skipped}\nErrors: ${data.errors}`);
      console.log('Color backfill result:', data);
    } catch (error) {
      console.error('Color backfill failed:', error);
      alert('Color backfill failed. Check console for details.');
    }
  };

  const handleBackfillEmbeddings = async () => {
    if (!confirm('This will generate semantic embeddings for all items (may take a while). Continue?')) {
      return;
    }

    try {
      // Process locally in batches to avoid overwhelming the browser
      const itemsWithoutEmbeddings = items.filter(item => !item.embedding || item.embedding.length === 0);
      let processed = 0;
      let errors = 0;

      for (const item of itemsWithoutEmbeddings) {
        try {
          // Create text representation of item
          const itemText = [
            item.title,
            item.aiTitle,
            item.aiDescription,
            ...(item.aiTags || []),
            ...(item.tags || [])
          ].filter(Boolean).join(' ');

          if (!itemText.trim()) {
            console.log(`Skipping item ${item.id} - no text content`);
            continue;
          }

          // Generate embedding
          const embedding = await generateEmbedding(itemText);

          // Update Firestore
          await updateDoc(doc(db, 'items', item.id), {
            embedding: embedding
          });

          processed++;
          console.log(`Generated embedding for ${item.id} (${processed}/${itemsWithoutEmbeddings.length})`);

          // Small delay to avoid overwhelming the browser
          if (processed % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          console.error(`Error processing item ${item.id}:`, error);
          errors++;
        }
      }

      alert(`Embedding backfill complete!\nProcessed: ${processed}\nErrors: ${errors}\nTotal items: ${items.length}`);
    } catch (error) {
      console.error('Embedding backfill failed:', error);
      alert('Embedding backfill failed. Check console for details.');
    }
  };

  // Filter items based on search - combine text, tag, and semantic search
  const filteredItems = useMemo(() => {
    if (!search) return [];
    
    const lowerSearch = search.toLowerCase();
    const seen = new Set<string>();
    const results: ContentItem[] = [];
    
    console.log('🔎 Filtering items for search:', search);
    console.log('   Semantic results available:', semanticResults.length);
    
    // First: exact text matches in title, content, OCR (highest priority)
    for (const item of items) {
      if (
        item.title.toLowerCase().includes(lowerSearch) ||
        item.aiTitle?.toLowerCase().includes(lowerSearch) ||
        item.aiDescription?.toLowerCase().includes(lowerSearch) ||
        item.content?.toLowerCase().includes(lowerSearch) ||
        item.ocr_text?.toLowerCase().includes(lowerSearch)
      ) {
        console.log('   ✅ Text match:', item.title);
        results.push(item);
        seen.add(item.id);
      }
    }

    // Second: exact tag matches (high priority) - check both user tags and AI tags
    for (const item of items) {
      if (seen.has(item.id)) continue;
      if (
        item.tags?.some((tag) => tag.toLowerCase().includes(lowerSearch)) ||
        item.aiTags?.some((tag) => tag.toLowerCase().includes(lowerSearch))
      ) {
        console.log('   ✅ Tag match:', item.title, 'tags:', [...(item.tags || []), ...(item.aiTags || [])]);
        results.push(item);
        seen.add(item.id);
      }
    }

    // Third: semantic matches on tags (finds related concepts like "animal" → "cat")
    console.log('   Adding semantic results...');
    for (const item of semanticResults) {
      if (seen.has(item.id)) continue;
      console.log('   ✅ Semantic match:', item.title);
      results.push(item);
      seen.add(item.id);
    }

    console.log(`📋 Total results: ${results.length} (${seen.size} unique)`);
    return results;
  }, [items, search, semanticResults]);

  const recentItems = items
    .filter(item => item.accessed_at)
    .sort((a, b) => b.accessed_at.toMillis() - a.accessed_at.toMillis())
    .slice(0, 5);

  const compressImageIfNeeded = async (file: File): Promise<File> => {
    const MAX_SIZE_MB = 5;
    const fileSizeMB = file.size / 1024 / 1024;

    if (fileSizeMB <= MAX_SIZE_MB) {
      return file;
    }

    console.log(`Compressing ${file.name} (${fileSizeMB.toFixed(2)}MB)`);

    const options = {
      maxSizeMB: MAX_SIZE_MB,
      maxWidthOrHeight: 4096,
      useWebWorker: true,
      fileType: file.type,
    };

    try {
      const compressedFile = await imageCompression(file, options);
      const compressedSizeMB = compressedFile.size / 1024 / 1024;
      console.log(`Compressed to ${compressedSizeMB.toFixed(2)}MB`);
      return compressedFile;
    } catch (error) {
      console.error('Compression failed, using original:', error);
      return file;
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;

    setUploading(true);
    try {
      // Compress image if needed
      const processedFile = await compressImageIfNeeded(file);

      // Convert file to base64
      const reader = new FileReader();
      reader.readAsDataURL(processedFile);

      await new Promise<void>((resolve, reject) => {
        reader.onload = async () => {
          try {
            const base64 = (reader.result as string).split(',')[1];

            // Call uploadToR2 function
            const uploadToR2 = httpsCallable<
              { fileName: string; fileType: string; fileData: string },
              { key: string; publicUrl: string; thumbnailUrl: string; width: number; height: number; aspectRatio: number; averageColor: [number, number, number] }
            >(functions, 'uploadToR2');

            const result = await uploadToR2({
              fileName: file.name,
              fileType: file.type,
              fileData: base64,
            });

            const { key, publicUrl, thumbnailUrl, width, height, aspectRatio, averageColor } = result.data;

            // Create Firestore document
            const itemRef = doc(db, 'items', key.replace(/\//g, '_'));
            await setDoc(itemRef, {
              type: 'image',
              title: file.name,
              url: publicUrl,
              thumbnail_url: thumbnailUrl,
              width,
              height,
              aspectRatio,
              averageColor,
              fileType: file.type,
              userId: auth.currentUser!.uid,
              tags: [],
              folder_ids: [],
              collection_ids: [],
              created_at: serverTimestamp(),
              updated_at: serverTimestamp(),
              accessed_at: serverTimestamp(),
              access_count: 0,
            });

            console.log('Upload successful:', publicUrl);
            onOpenChange(false);
            resolve();
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = reject;
      });
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleCollectionUploadClick = () => {
    setShowCollectionDialog(true);
    setCollectionName('');
    setFilteredCollections([]);
  };

  const handleCollectionNameChange = (value: string) => {
    setCollectionName(value);

    // Filter collections based on input
    if (value.trim()) {
      const matches = collections.filter(c =>
        c.name.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredCollections(matches);
    } else {
      setFilteredCollections([]);
    }
  };

  const handleSelectExistingCollection = (collection: Collection) => {
    // Add to selected collections if not already there
    if (!selectedCollectionIds.includes(collection.id)) {
      setSelectedCollectionIds([...selectedCollectionIds, collection.id]);
      // Set as current if it's the first one
      if (selectedCollectionIds.length === 0) {
        setCurrentCollectionId(collection.id);
      }
    }
    setCollectionName('');
    setFilteredCollections([]);
  };

  const handleCollectionNameSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!collectionName.trim() || !auth.currentUser) return;

    // Check if exact match exists
    const exactMatch = collections.find(
      c => c.name.toLowerCase() === collectionName.trim().toLowerCase()
    );

    if (exactMatch) {
      // Add existing collection to selection
      if (!selectedCollectionIds.includes(exactMatch.id)) {
        setSelectedCollectionIds([...selectedCollectionIds, exactMatch.id]);
        // Set as current if it's the first one
        if (selectedCollectionIds.length === 0) {
          setCurrentCollectionId(exactMatch.id);
        }
      }
      setCollectionName(''); // Clear input after adding
      setFilteredCollections([]);
      return;
    }

    try {
      // Create new collection
      const collectionId = `collection_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const collectionRef = doc(db, 'collections', collectionId);

      await setDoc(collectionRef, {
        id: collectionId,
        name: collectionName.trim(),
        description: '',
        item_ids: [],
        cover_image: '',
        userId: auth.currentUser.uid,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });

      // Add to selected collections
      setSelectedCollectionIds([...selectedCollectionIds, collectionId]);
      // Set as current if it's the first one
      if (selectedCollectionIds.length === 0) {
        setCurrentCollectionId(collectionId);
      }
      setCollectionName(''); // Clear input after adding
      setFilteredCollections([]);
    } catch (error) {
      console.error('Failed to create collection:', error);
      alert('Failed to create collection. Please try again.');
    }
  };

  const handleCancelCollection = () => {
    setShowCollectionDialog(false);
    setCollectionName('');
    setFilteredCollections([]);
    setSelectedCollectionIds([]);
    setCurrentCollectionId(null);
  };

  const handleRemoveSelectedCollection = (collectionId: string) => {
    const newSelected = selectedCollectionIds.filter(id => id !== collectionId);
    setSelectedCollectionIds(newSelected);
    // Update primary if we removed it
    if (collectionId === currentCollectionId) {
      setCurrentCollectionId(newSelected[0] || null);
    }
  };

  const handleStartUpload = () => {
    if (selectedCollectionIds.length === 0) {
      alert('Please select at least one collection');
      return;
    }
    setShowCollectionDialog(false);
    collectionFileInputRef.current?.click();
  };

  const handleCreateTextItemClick = () => {
    setShowTextItemDialog(true);
    setTextItemTitle('');
  };

  const handleCancelTextItem = () => {
    setShowTextItemDialog(false);
    setTextItemTitle('');
  };

  const handleCreateTextItem = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!textItemTitle.trim() || !auth.currentUser) return;

    setUploading(true);
    try {
      // Generate unique ID
      const itemId = `text_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.json`;
      const storagePath = `text-items/${auth.currentUser.uid}/${itemId}`;

      // Create empty Editor.js document
      const emptyDocument = {
        time: Date.now(),
        blocks: [],
        version: '2.28.0',
      };

      // Upload empty document to Firebase Storage
      const storageRef = ref(storage, storagePath);
      await uploadString(storageRef, JSON.stringify(emptyDocument), 'raw', {
        contentType: 'application/json',
      });

      // Create Firestore document
      const itemRef = doc(db, 'items', itemId);
      const newItem: Partial<ContentItem> = {
        id: itemId,
        type: 'text',
        title: textItemTitle.trim(),
        storage_path: storagePath,
        userId: auth.currentUser.uid,
        tags: [],
        folder_ids: [],
        collection_ids: [],
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        accessed_at: serverTimestamp(),
        access_count: 0,
      };

      await setDoc(itemRef, newItem);

      console.log('Text item created:', itemId);

      // Close dialog and open the item in sidebar
      setShowTextItemDialog(false);
      setTextItemTitle('');
      onOpenChange(false);

      // Select the newly created item to open it in sidebar
      // We need to pass the complete item to onSelectItem
      onSelectItem(newItem as ContentItem);
    } catch (error) {
      console.error('Failed to create text item:', error);
      alert('Failed to create text item. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleCollectionFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !auth.currentUser || !currentCollectionId) return;

    console.log(`Starting collection upload: ${files.length} files to collection "${collectionName}" (${currentCollectionId})`);

    setUploading(true);
    setUploadProgress({ current: 0, total: files.length, fileName: '' });
    const uploadedItemIds: string[] = [];

    try {
      // Upload each file
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Update progress
        setUploadProgress({ current: i + 1, total: files.length, fileName: file.name });

        // Compress image if needed
        const processedFile = await compressImageIfNeeded(file);

        // Convert file to base64
        const reader = new FileReader();
        reader.readAsDataURL(processedFile);

        await new Promise<void>((resolve, reject) => {
          reader.onload = async () => {
            try {
              const base64 = (reader.result as string).split(',')[1];

              // Call uploadToR2 function
              const uploadToR2 = httpsCallable<
                { fileName: string; fileType: string; fileData: string },
                { key: string; publicUrl: string; thumbnailUrl: string; width: number; height: number; aspectRatio: number; averageColor: [number, number, number] }
              >(functions, 'uploadToR2');

              const result = await uploadToR2({
                fileName: file.name,
                fileType: file.type,
                fileData: base64,
              });

              const { key, publicUrl, thumbnailUrl, width, height, aspectRatio, averageColor } = result.data;
              const itemId = key.replace(/\//g, '_');

              // Create Firestore document with collection reference
              const itemRef = doc(db, 'items', itemId);
              const docData = {
                type: 'image' as const,
                title: file.name,
                url: publicUrl,
                thumbnail_url: thumbnailUrl,
                width,
                height,
                aspectRatio,
                averageColor,
                fileType: file.type,
                userId: auth.currentUser!.uid,
                tags: collections
                  .filter(c => selectedCollectionIds.includes(c.id))
                  .map(c => c.name),
                folder_ids: [],
                collectionId: selectedCollectionIds[0], // First collection is primary
                collection_ids: selectedCollectionIds, // All selected collections
                created_at: serverTimestamp(),
                updated_at: serverTimestamp(),
                accessed_at: serverTimestamp(),
                access_count: 0,
              };

              console.log(`Creating Firestore doc for ${file.name}:`, { itemId, url: publicUrl, type: docData.type });

              await setDoc(itemRef, docData);

              uploadedItemIds.push(itemId);
              console.log(`Upload ${i + 1}/${files.length} successful:`, publicUrl);
              resolve();
            } catch (error) {
              reject(error);
            }
          };
          reader.onerror = reject;
        });
      }

      // Update all selected collections with item IDs
      for (const collectionId of selectedCollectionIds) {
        const collectionRef = doc(db, 'collections', collectionId);
        const collection = collections.find(c => c.id === collectionId);

        if (collection && collection.item_ids && collection.item_ids.length > 0) {
          // Existing collection - append new items
          await updateDoc(collectionRef, {
            item_ids: arrayUnion(...uploadedItemIds),
            updated_at: serverTimestamp(),
          });
        } else {
          // New collection - set items
          await setDoc(collectionRef, {
            item_ids: uploadedItemIds,
            updated_at: serverTimestamp(),
          }, { merge: true });
        }
      }

      console.log(`All ${files.length} files uploaded successfully to ${selectedCollectionIds.length} collection(s)`);
      onOpenChange(false);

      // Reset state
      setCollectionName('');
      setSelectedCollectionIds([]);
      setCurrentCollectionId(null);
      setUploadProgress(null);
    } catch (error) {
      console.error('Collection upload failed:', error);
      alert('Some uploads failed. Please check the console.');
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (collectionFileInputRef.current) {
        collectionFileInputRef.current.value = '';
      }
    }
  };

  return (
    <>
      {console.log('🎨 RENDER - search:', search, 'filteredItems:', filteredItems.length, 'semanticResults:', semanticResults.length)}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
      <input
        ref={collectionFileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleCollectionFileSelect}
        className="hidden"
      />

      <Command.Dialog
        open={open}
        onOpenChange={onOpenChange}
        label="Command Palette"
        shouldFilter={false}
        className="fixed inset-x-4 top-4 sm:top-1/4 sm:left-1/2 sm:-translate-x-1/2 sm:w-[600px] sm:inset-x-auto bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden max-h-[90vh] sm:max-h-none"
      >
        <Command.Input
          value={search}
          onValueChange={setSearch}
          placeholder="Search or type a command..."
          className="w-full px-4 sm:px-6 py-3 sm:py-4 text-base sm:text-lg outline-none border-b border-gray-100"
        />
        <Command.List className="max-h-[60vh] sm:max-h-[400px] overflow-y-auto p-2">{/* Empty */}
          <Command.Empty className="px-4 py-8 text-center text-gray-500 text-sm sm:text-base">
            No results found.
          </Command.Empty>

          {search === '' && recentItems.length > 0 && (
            <Command.Group heading="Recent" className="px-2 py-2">
              {recentItems.map((item) => (
                <Command.Item
                  key={item.id}
                  onSelect={() => onSelectItem(item)}
                  className="px-3 sm:px-4 py-2 sm:py-3 rounded-lg cursor-pointer hover:bg-gray-100 flex items-center gap-2 sm:gap-3"
                >
                  <span className="font-medium text-sm sm:text-base truncate">{item.title}</span>
                  <span className="text-xs sm:text-sm text-gray-500">{item.type}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {search !== '' && filteredItems.length > 0 && (
            <Command.Group heading="Search Results" className="px-2 py-2">
              {filteredItems.slice(0, 20).map((item) => (
                <Command.Item
                  key={item.id}
                  onSelect={() => onSelectItem(item)}
                  className="px-3 sm:px-4 py-2 sm:py-3 rounded-lg cursor-pointer hover:bg-gray-100"
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-medium text-sm sm:text-base">{item.title}</span>
                    <div className="flex gap-2 flex-wrap">
                      {item.tags?.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="text-xs px-2 py-0.5 sm:py-1 bg-gray-100 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          <Command.Separator className="h-px bg-gray-100 my-2" />

          <Command.Group heading="Actions" className="px-2 py-2">
            <Command.Item
              onSelect={handleUploadClick}
              className="px-4 py-3 rounded-lg cursor-pointer hover:bg-gray-100 flex items-center gap-2"
              disabled={uploading}
            >
              {uploading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <span>📤</span>
                  <span>Upload Image</span>
                </>
              )}
            </Command.Item>

            {!showCollectionDialog ? (
              <Command.Item
                onSelect={handleCollectionUploadClick}
                className="px-4 py-3 rounded-lg cursor-pointer hover:bg-gray-100 flex items-center gap-2"
                disabled={uploading}
              >
                {uploading && uploadProgress ? (
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span className="text-sm">
                        Uploading {uploadProgress.current} of {uploadProgress.total}
                      </span>
                    </div>
                    <div className="mb-1 text-xs text-gray-500 truncate">{uploadProgress.fileName}</div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <span>📁</span>
                    <span>Collection Upload</span>
                  </>
                )}
              </Command.Item>
            ) : (
              <div className="px-4 py-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <span>📁</span>
                  <span className="font-medium text-sm">Collection Upload</span>
                </div>
                
                {/* Selected Collections */}
                {selectedCollectionIds.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {selectedCollectionIds.map((collId, index) => {
                      const coll = collections.find(c => c.id === collId);
                      if (!coll) return null;
                      return (
                        <span
                          key={collId}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-medium"
                        >
                          {index === 0 && <span className="text-[10px] opacity-70">(primary)</span>}
                          <span>{coll.name}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveSelectedCollection(collId)}
                            className="hover:text-purple-950"
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
                
                <form onSubmit={handleCollectionNameSubmit} className="flex flex-col gap-2">
                  <div className="relative">
                    <input
                      type="text"
                      value={collectionName}
                      onChange={(e) => handleCollectionNameChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          handleCancelCollection();
                        }
                      }}
                      placeholder={selectedCollectionIds.length > 0 ? "Add another collection..." : "Enter or select collection name..."}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      autoFocus
                    />
                    {/* Autocomplete Dropdown */}
                    {filteredCollections.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-40 overflow-y-auto z-10">
                        {filteredCollections.map((collection) => (
                          <button
                            key={collection.id}
                            type="button"
                            onClick={() => handleSelectExistingCollection(collection)}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 flex items-center justify-between"
                          >
                            <span>{collection.name}</span>
                            <span className="text-xs text-gray-500">
                              {collection.item_ids?.length || 0} items
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={handleCancelCollection}
                      className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md"
                    >
                      Cancel
                    </button>
                    {selectedCollectionIds.length > 0 ? (
                      <button
                        type="button"
                        onClick={handleStartUpload}
                        className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600"
                      >
                        Upload to {selectedCollectionIds.length} Collection{selectedCollectionIds.length > 1 ? 's' : ''}
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={!collectionName.trim()}
                        className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {collections.some(c => c.name.toLowerCase() === collectionName.trim().toLowerCase())
                          ? 'Add Collection'
                          : 'Create Collection'}
                      </button>
                    )}
                  </div>
                </form>
              </div>
            )}

            {!showTextItemDialog ? (
              <Command.Item
                onSelect={handleCreateTextItemClick}
                className="px-4 py-3 rounded-lg cursor-pointer hover:bg-gray-100 flex items-center gap-2"
                disabled={uploading}
              >
                <span>📝</span>
                <span>New Text Item</span>
              </Command.Item>
            ) : (
              <div className="px-4 py-3 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center gap-2 mb-2">
                  <span>📝</span>
                  <span className="font-medium text-sm">New Text Item</span>
                </div>
                <form onSubmit={handleCreateTextItem} className="flex flex-col gap-2">
                  <input
                    type="text"
                    value={textItemTitle}
                    onChange={(e) => setTextItemTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        handleCancelTextItem();
                      }
                    }}
                    placeholder="Enter title..."
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                    autoFocus
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={handleCancelTextItem}
                      className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!textItemTitle.trim()}
                      className="px-3 py-1.5 text-sm bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Create
                    </button>
                  </div>
                </form>
              </div>
            )}

            <Command.Item className="px-4 py-3 rounded-lg cursor-pointer hover:bg-gray-100">
              <span>🗂️ Create Collection</span>
            </Command.Item>
          </Command.Group>

          <Command.Separator className="h-px bg-gray-100 my-2" />

          <Command.Group heading="Admin Tools" className="px-2 py-2">
            <Command.Item
              onSelect={handleBackfillCollections}
              className="px-4 py-3 rounded-lg cursor-pointer hover:bg-gray-100 flex items-center gap-2"
            >
              <span>🔄</span>
              <span>Backfill Collection References</span>
            </Command.Item>
            <Command.Item
              onSelect={handleBackfillColors}
              className="px-4 py-3 rounded-lg cursor-pointer hover:bg-gray-100 flex items-center gap-2"
            >
              <span>🎨</span>
              <span>Backfill Image Colors</span>
            </Command.Item>
            <Command.Item
              onSelect={handleBackfillEmbeddings}
              className="px-4 py-3 rounded-lg cursor-pointer hover:bg-gray-100 flex items-center gap-2"
            >
              <span>🧠</span>
              <span>Generate Semantic Embeddings</span>
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command.Dialog>
    </>
  );
}
