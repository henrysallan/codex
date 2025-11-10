import { useState, useEffect } from 'react';
import GraphView from './components/GraphView';
import CommandPalette from './components/search/CommandPalette';
import type { ContentItem } from './types';

function App() {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [items] = useState<ContentItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);

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
    // TODO: Zoom to node and open sidebar
  };

  return (
    <div className="relative w-full h-screen bg-background">
      {/* Search Bar */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 w-[600px] z-50">
        <div
          className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200 cursor-pointer"
          onClick={() => setCommandPaletteOpen(true)}
        >
          <div className="px-6 py-4 text-lg text-gray-400">
            Search anything... ⌘K
          </div>
        </div>
      </div>

      {/* Graph Visualization */}
      <GraphView />

      {/* Command Palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        items={items}
        onSelectItem={handleSelectItem}
      />

      {/* Sidebar (TODO) */}
      {selectedItem && (
        <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-xl p-6">
          <h2 className="text-2xl font-bold">{selectedItem.title}</h2>
          <div className="flex gap-2 mt-4 flex-wrap">
            {selectedItem.tags.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 bg-gray-100 rounded-full text-sm"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
