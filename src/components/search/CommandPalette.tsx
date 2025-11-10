import { useState } from 'react';
import { Command } from 'cmdk';
import type { ContentItem } from '../../types';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ContentItem[];
  onSelectItem: (item: ContentItem) => void;
}

export default function CommandPalette({
  open,
  onOpenChange,
  items,
  onSelectItem,
}: CommandPaletteProps) {
  const [search, setSearch] = useState('');

  // Filter items based on search
  const filteredItems = items.filter(
    (item) =>
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      item.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase()))
  );

  const recentItems = items
    .sort((a, b) => b.accessed_at.toMillis() - a.accessed_at.toMillis())
    .slice(0, 5);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command Palette"
      className="fixed top-1/4 left-1/2 -translate-x-1/2 w-[600px] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
    >
      <Command.Input
        value={search}
        onValueChange={setSearch}
        placeholder="Search or type a command..."
        className="w-full px-6 py-4 text-lg outline-none border-b border-gray-100"
      />
      <Command.List className="max-h-[400px] overflow-y-auto p-2">
        <Command.Empty className="px-4 py-8 text-center text-gray-500">
          No results found.
        </Command.Empty>

        {search === '' && recentItems.length > 0 && (
          <Command.Group heading="Recent" className="px-2 py-2">
            {recentItems.map((item) => (
              <Command.Item
                key={item.id}
                onSelect={() => onSelectItem(item)}
                className="px-4 py-3 rounded-lg cursor-pointer hover:bg-gray-100 flex items-center gap-3"
              >
                <span className="font-medium">{item.title}</span>
                <span className="text-sm text-gray-500">{item.type}</span>
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
                className="px-4 py-3 rounded-lg cursor-pointer hover:bg-gray-100"
              >
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{item.title}</span>
                  <div className="flex gap-2">
                    {item.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-1 bg-gray-100 rounded"
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
          <Command.Item className="px-4 py-3 rounded-lg cursor-pointer hover:bg-gray-100">
            New Note
          </Command.Item>
          <Command.Item className="px-4 py-3 rounded-lg cursor-pointer hover:bg-gray-100">
            Upload Files
          </Command.Item>
          <Command.Item className="px-4 py-3 rounded-lg cursor-pointer hover:bg-gray-100">
            Create Collection
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
