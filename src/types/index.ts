export interface ContentItem {
  id: string;
  type: 'image' | 'text' | 'pdf' | 'link';
  title: string; // AI-generated or user-provided
  content?: string; // For text items, stored directly (deprecated - use storage_path)
  storage_path?: string; // Firebase Storage path for Editor.js JSON (for text items)
  url?: string; // R2 URL (alias for r2_url)
  r2_url?: string; // For images/PDFs
  link_url?: string; // For web links
  link_metadata?: {
    favicon: string;
    description: string;
    image: string;
  };
  thumbnail_url?: string; // R2 URL for generated thumbnail
  width?: number; // Original image width
  height?: number; // Original image height
  aspectRatio?: number; // width / height
  averageColor?: [number, number, number]; // RGB average color [r, g, b]
  ocr_text?: string; // Extracted text from images/PDFs
  tags?: string[]; // User-added tags
  aiTags?: string[]; // AI-generated tags
  aiTitle?: string; // AI-generated title
  aiDescription?: string; // AI-generated description
  aiProcessingFailed?: boolean; // Whether AI processing failed
  aiProcessingError?: string; // Error message if processing failed
  folder_ids?: string[]; // Traditional organization
  collectionId?: string; // Primary collection this item belongs to
  collection_ids?: string[]; // All collections this item belongs to
  embedding?: number[]; // 384-dimension vector
  umap_coords?: { x: number; y: number; z: number }; // 3D positioning
  physics_state?: {
    velocity: { x: number; y: number; z: number };
    mass: number;
  };
  userId?: string; // Owner user ID
  fileType?: string; // MIME type
  created_at?: any;
  updated_at?: any;
  accessed_at?: any;
  access_count?: number;
}

export interface Folder {
  id: string;
  name: string;
  parent_id?: string;
  color: string;
  icon: string;
}

export interface Collection {
  id: string;
  name: string;
  description: string;
  item_ids: string[];
  cover_image: string;
  userId?: string;
  created_at?: any;
  updated_at?: any;
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface SearchResult {
  item: ContentItem;
  similarity: number;
}
