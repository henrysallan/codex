import { Timestamp } from 'firebase/firestore';

export interface ContentItem {
  id: string;
  type: 'image' | 'text' | 'pdf' | 'link';
  title: string; // AI-generated or user-provided
  content?: string; // For text items, stored directly
  r2_url?: string; // For images/PDFs
  link_url?: string; // For web links
  link_metadata?: {
    favicon: string;
    description: string;
    image: string;
  };
  thumbnail_url: string; // R2 URL for generated thumbnail
  ocr_text?: string; // Extracted text from images/PDFs
  tags: string[]; // AI-generated
  folder_ids: string[]; // Traditional organization
  collection_ids: string[];
  embedding: number[]; // 384-dimension vector
  umap_coords: { x: number; y: number; z: number }; // 3D positioning
  physics_state?: {
    velocity: { x: number; y: number; z: number };
    mass: number;
  };
  created_at: Timestamp;
  updated_at: Timestamp;
  accessed_at: Timestamp;
  access_count: number;
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
