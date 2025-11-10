import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { ContentItem } from '../../types';
import GraphNode from './GraphNode';

export default function GraphNodes() {
  const [items, setItems] = useState<ContentItem[]>([]);

  useEffect(() => {
    // Subscribe to real-time updates from Firestore
    const unsubscribe = onSnapshot(
      collection(db, 'items'),
      (snapshot) => {
        const newItems: ContentItem[] = [];
        snapshot.forEach((doc) => {
          newItems.push({ id: doc.id, ...doc.data() } as ContentItem);
        });
        setItems(newItems);
      },
      (error) => {
        console.error('Error fetching items:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  return (
    <group>
      {items.map((item) => (
        <GraphNode key={item.id} item={item} />
      ))}
    </group>
  );
}
