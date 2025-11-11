import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { doc, updateDoc, deleteDoc, serverTimestamp, arrayUnion, arrayRemove } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';
import type { ContentItem, Collection } from '../types';
import type { OutputData } from '@editorjs/editorjs';
import TextEditor, { type TextEditorRef } from './TextEditor';

interface ItemSidebarProps {
  item: ContentItem | null;
  onClose: () => void;
  collections: Collection[];
}

export default function ItemSidebar({ item, onClose, collections }: ItemSidebarProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedTags, setEditedTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [textContent, setTextContent] = useState<OutputData | null>(null);
  const [loadingText, setLoadingText] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const textEditorRef = useRef<TextEditorRef>(null);
  
  // Collection editing state
  const [editedCollectionIds, setEditedCollectionIds] = useState<string[]>([]);
  const [editedPrimaryCollection, setEditedPrimaryCollection] = useState<string | undefined>(undefined);
  const [showCollectionPicker, setShowCollectionPicker] = useState(false);

  // Reset states when item changes
  useEffect(() => {
    setIsEditing(false);
    setEditedTitle('');
    setEditedTags([]);
    setNewTag('');
    setIsDeleting(false);
    setTextContent(null);
    setLoadingText(false);
  }, [item?.id]);

  // Load text content from Firebase Storage for text items
  useEffect(() => {
    if (!item || item.type !== 'text' || !item.storage_path) return;

    const loadTextContent = async () => {
      setLoadingText(true);
      try {
        // Use Firebase SDK's getBytes which handles auth automatically
        const { getBytes, ref } = await import('firebase/storage');
        const { storage } = await import('../lib/firebase');
        
        const storageRef = ref(storage, item.storage_path);
        const bytes = await getBytes(storageRef);
        
        // Convert bytes to JSON
        const text = new TextDecoder().decode(bytes);
        const data = JSON.parse(text);
        
        console.log('📖 Loaded text content:', { itemId: item.id, blocks: data.blocks?.length });
        setTextContent(data);
      } catch (error) {
        console.error('Failed to load text content:', error);
        setTextContent({ time: Date.now(), blocks: [] });
      } finally {
        setLoadingText(false);
      }
    };

    loadTextContent();
  }, [item?.id, item?.storage_path]);

  // Callback to update textContent after save
  const handleTextSave = (data: OutputData) => {
    setTextContent(data);
  };

  if (!item) return null;

  // Get collection names for this item
  const itemCollections = collections.filter(c => 
    item.collection_ids?.includes(c.id) || item.collectionId === c.id
  );

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    try {
      const date = timestamp.toDate();
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(date);
    } catch {
      return 'N/A';
    }
  };

  const handleEditClick = () => {
    setEditedTitle(item.title);
    setEditedTags([...(item.tags || []), ...(item.aiTags || [])]);
    setEditedCollectionIds(item.collection_ids || []);
    setEditedPrimaryCollection(item.collectionId);
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    try {
      const itemRef = doc(db, 'items', item.id);
      
      // Update the item with new collection references
      await updateDoc(itemRef, {
        title: editedTitle,
        tags: editedTags,
        collection_ids: editedCollectionIds,
        collectionId: editedPrimaryCollection,
        updated_at: serverTimestamp(),
      });

      // Update collection documents to add/remove this item
      const originalCollectionIds = item.collection_ids || [];
      const addedCollections = editedCollectionIds.filter(id => !originalCollectionIds.includes(id));
      const removedCollections = originalCollectionIds.filter(id => !editedCollectionIds.includes(id));

      // Add item to new collections
      for (const collectionId of addedCollections) {
        const collectionRef = doc(db, 'collections', collectionId);
        await updateDoc(collectionRef, {
          item_ids: arrayUnion(item.id),
          updated_at: serverTimestamp(),
        });
      }

      // Remove item from removed collections
      for (const collectionId of removedCollections) {
        const collectionRef = doc(db, 'collections', collectionId);
        await updateDoc(collectionRef, {
          item_ids: arrayRemove(item.id),
          updated_at: serverTimestamp(),
        });
      }

      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update item:', error);
      alert('Failed to save changes. Please try again.');
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedTitle('');
    setEditedTags([]);
    setNewTag('');
    setEditedCollectionIds([]);
    setEditedPrimaryCollection(undefined);
    setShowCollectionPicker(false);
  };

  const handleAddTag = () => {
    if (newTag.trim() && !editedTags.includes(newTag.trim())) {
      setEditedTags([...editedTags, newTag.trim()]);
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setEditedTags(editedTags.filter(tag => tag !== tagToRemove));
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this item? This will also remove it from R2 storage.')) {
      return;
    }

    setIsDeleting(true);
    try {
      // Call Cloud Function to delete from R2
      const deleteFromR2 = httpsCallable(functions, 'deleteFromR2');
      await deleteFromR2({ itemId: item.id, url: item.url });

      // Delete from Firestore
      const itemRef = doc(db, 'items', item.id);
      await deleteDoc(itemRef);

      onClose();
    } catch (error) {
      console.error('Failed to delete item:', error);
      alert('Failed to delete item. Please try again.');
      setIsDeleting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className={`fixed right-4 top-4 bottom-4 ${item.type === 'text' ? 'w-full sm:w-[630px]' : 'w-full sm:w-[420px]'} bg-white shadow-2xl z-50 overflow-hidden rounded-xl flex flex-col`}
      >
        {/* Header */}
        <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          {item.type === 'text' ? (
            <>
              <input
                type="text"
                value={editedTitle || item.title}
                onChange={(e) => setEditedTitle(e.target.value)}
                onFocus={() => !editedTitle && setEditedTitle(item.title)}
                className="flex-1 text-base sm:text-lg font-semibold text-gray-900 border-none focus:outline-none focus:ring-0 bg-transparent"
                placeholder="Untitled"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    setIsSaving(true);
                    try {
                      // Save both title and content
                      const titleToSave = editedTitle || item.title;
                      const promises = [];
                      
                      // Update title if changed
                      if (titleToSave && titleToSave !== item.title) {
                        const itemRef = doc(db, 'items', item.id);
                        promises.push(
                          updateDoc(itemRef, {
                            title: titleToSave,
                            updated_at: serverTimestamp(),
                          })
                        );
                      }
                      
                      // Save editor content
                      if (textEditorRef.current) {
                        promises.push(textEditorRef.current.save());
                      }
                      
                      await Promise.all(promises);
                    } catch (error) {
                      console.error('Failed to save:', error);
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                  disabled={isSaving}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  aria-label="Close sidebar"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900">Details</h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Close sidebar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
        {item.type === 'text' ? (
          // Text Editor View
          <div className="h-full">
            {/* Editor */}
            <div className="h-full">
              {loadingText ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-gray-500">Loading...</div>
                </div>
              ) : textContent && item.storage_path ? (
                <TextEditor
                  ref={textEditorRef}
                  itemId={item.id}
                  storagePath={item.storage_path}
                  initialData={textContent}
                  onSave={handleTextSave}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-red-500">Failed to load content</div>
                </div>
              )}
            </div>
          </div>
        ) : (
          // Regular Item View (Image, etc.)
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
            {/* Image Preview */}
            {item.type === 'image' && item.url && (
              <div className="relative w-full rounded-lg overflow-hidden bg-gray-100" style={{ aspectRatio: item.aspectRatio || 1 }}>
                <img
                  src={item.url}
                  alt={item.title}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

          {/* Title */}
          {isEditing ? (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Title</label>
              <input
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ) : (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Title</label>
              <p className="mt-1 text-base sm:text-lg font-semibold text-gray-900">{item.title}</p>
            </div>
          )}

          {/* AI-Generated Title (if different) */}
          {!isEditing && item.aiTitle && item.aiTitle !== item.title && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">AI Title</label>
              <p className="mt-1 text-base text-gray-700">{item.aiTitle}</p>
            </div>
          )}

          {/* Collections */}
          {!isEditing && itemCollections.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Collections</label>
              <div className="mt-1 flex flex-wrap gap-2">
                {itemCollections.map((collection) => (
                  <span
                    key={collection.id}
                    className="px-3 py-1.5 bg-purple-50 text-purple-700 rounded-full text-sm font-medium flex items-center gap-1"
                  >
                    📁 {collection.name}
                    {collection.id === item.collectionId && (
                      <span className="ml-1 text-xs opacity-70">(primary)</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Editable Collections */}
          {isEditing && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Collections</label>
              <div className="mt-2 space-y-2">
                {/* Show current collections */}
                <div className="flex flex-wrap gap-2">
                  {collections
                    .filter((c) => editedCollectionIds.includes(c.id))
                    .map((collection) => (
                      <span
                        key={collection.id}
                        className="px-3 py-1.5 bg-purple-50 text-purple-700 rounded-full text-sm font-medium flex items-center gap-2"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (collection.id === editedPrimaryCollection) {
                              setEditedPrimaryCollection(editedCollectionIds.find(id => id !== collection.id));
                            }
                            setEditedCollectionIds(editedCollectionIds.filter((id) => id !== collection.id));
                          }}
                          className="text-purple-900 hover:text-purple-950"
                        >
                          ×
                        </button>
                        <span>{collection.name}</span>
                        {collection.id === editedPrimaryCollection ? (
                          <span className="text-xs opacity-70">(primary)</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditedPrimaryCollection(collection.id)}
                            className="text-xs underline opacity-70 hover:opacity-100"
                          >
                            make primary
                          </button>
                        )}
                      </span>
                    ))}
                </div>
                
                {/* Add collection button/dropdown */}
                <div className="relative">
                  {!showCollectionPicker ? (
                    <button
                      type="button"
                      onClick={() => setShowCollectionPicker(true)}
                      className="px-3 py-1.5 text-sm text-purple-700 border border-purple-300 rounded-lg hover:bg-purple-50 transition-colors"
                    >
                      + Add to Collection
                    </button>
                  ) : (
                    <div className="border border-gray-300 rounded-lg p-2 bg-white shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-gray-700">Select Collection</span>
                        <button
                          type="button"
                          onClick={() => setShowCollectionPicker(false)}
                          className="text-gray-500 hover:text-gray-700"
                        >
                          ×
                        </button>
                      </div>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {collections
                          .filter((c) => !editedCollectionIds.includes(c.id))
                          .map((collection) => (
                            <button
                              key={collection.id}
                              type="button"
                              onClick={() => {
                                setEditedCollectionIds([...editedCollectionIds, collection.id]);
                                if (!editedPrimaryCollection) {
                                  setEditedPrimaryCollection(collection.id);
                                }
                                setShowCollectionPicker(false);
                              }}
                              className="w-full text-left px-2 py-1.5 text-sm hover:bg-purple-50 rounded transition-colors"
                            >
                              📁 {collection.name}
                            </button>
                          ))}
                        {collections.filter((c) => !editedCollectionIds.includes(c.id)).length === 0 && (
                          <p className="text-xs text-gray-500 py-2">All collections added</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Description */}
          {!isEditing && item.aiDescription && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Description</label>
              <p className="mt-1 text-sm text-gray-700 leading-relaxed">{item.aiDescription}</p>
            </div>
          )}

          {/* Tags */}
          {isEditing ? (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 block">Tags</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {editedTags.map((tag, index) => (
                  <span
                    key={index}
                    className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-sm font-medium flex items-center gap-1"
                  >
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:text-blue-900"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                  placeholder="Add tag..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <button
                  onClick={handleAddTag}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                  Add
                </button>
              </div>
            </div>
          ) : (
            (item.tags && item.tags.length > 0) || (item.aiTags && item.aiTags.length > 0) ? (
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 block">Tags</label>
                <div className="flex flex-wrap gap-2">
                  {[...(item.tags || []), ...(item.aiTags || [])].map((tag, index) => (
                    <span
                      key={index}
                      className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-sm font-medium"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ) : null
          )}

          {/* Metadata */}
          <div className="pt-4 border-t border-gray-200 space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Type</label>
              <p className="mt-1 text-sm text-gray-700 capitalize">{item.type}</p>
            </div>

            {item.created_at && (
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Created</label>
                <p className="mt-1 text-sm text-gray-700">{formatDate(item.created_at)}</p>
              </div>
            )}

            {item.updated_at && (
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Last Updated</label>
                <p className="mt-1 text-sm text-gray-700">{formatDate(item.updated_at)}</p>
              </div>
            )}

            {item.accessed_at && (
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Last Accessed</label>
                <p className="mt-1 text-sm text-gray-700">{formatDate(item.accessed_at)}</p>
              </div>
            )}

            {item.access_count !== undefined && (
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Views</label>
                <p className="mt-1 text-sm text-gray-700">{item.access_count}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-gray-200 space-y-2">
            {!isEditing && item.url && (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full px-4 py-2 bg-blue-600 text-white text-center rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Open Original
              </a>
            )}

            {isEditing ? (
              <div className="flex gap-2">
                <button
                  onClick={handleCancelEdit}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 text-center rounded-lg hover:bg-gray-200 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white text-center rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Save Changes
                </button>
              </div>
            ) : (
              <button
                onClick={handleEditClick}
                className="block w-full px-4 py-2 bg-gray-100 text-gray-700 text-center rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                Edit Details
              </button>
            )}

            {!isEditing && (
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="block w-full px-4 py-2 bg-red-600 text-white text-center rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            )}
          </div>
        </div>
        )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
