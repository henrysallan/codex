import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import EditorJS from '@editorjs/editorjs';
import type { OutputData } from '@editorjs/editorjs';
// @ts-ignore - Editor.js tools have type compatibility issues
import Header from '@editorjs/header';
// @ts-ignore
import List from '@editorjs/list';
// @ts-ignore
import Quote from '@editorjs/quote';
import { ref as storageRef, uploadString } from 'firebase/storage';
import { storage } from '../lib/firebase';

interface TextEditorProps {
  itemId: string;
  storagePath: string;
  initialData?: OutputData;
  onSave?: (data: OutputData) => void;
}

export interface TextEditorRef {
  save: () => Promise<void>;
}

const TextEditor = forwardRef<TextEditorRef, TextEditorProps>(({ storagePath, initialData, onSave }, ref) => {
  const editorRef = useRef<EditorJS | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Expose save function to parent component
  useImperativeHandle(ref, () => ({
    save: handleSave
  }));

  // Function to add markdown-style shortcuts
  const addMarkdownShortcuts = () => {
    if (!containerRef.current) return;

    const editorElement = containerRef.current;
    
    editorElement.addEventListener('keydown', async (e: KeyboardEvent) => {
      if (!editorRef.current) return;
      
      const target = e.target as HTMLElement;
      if (!target.getAttribute('contenteditable')) return;

      // Handle Space key for markdown shortcuts
      if (e.key === ' ' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        const text = target.textContent || '';
        
        let shouldConvert = false;
        let newBlockType = '';
        let newBlockData: any = {};
        
        // Check for header shortcuts: # , ## , ### , ####
        if (text === '#') {
          shouldConvert = true;
          newBlockType = 'header';
          newBlockData = { text: '', level: 1 };
        } else if (text === '##') {
          shouldConvert = true;
          newBlockType = 'header';
          newBlockData = { text: '', level: 2 };
        } else if (text === '###') {
          shouldConvert = true;
          newBlockType = 'header';
          newBlockData = { text: '', level: 3 };
        } else if (text === '####') {
          shouldConvert = true;
          newBlockType = 'header';
          newBlockData = { text: '', level: 4 };
        } else if (text === '*' || text === '-') {
          // Check for list shortcuts: * or -
          shouldConvert = true;
          newBlockType = 'list';
          newBlockData = { style: 'unordered', items: [''] };
        } else if (text.match(/^\d+\.$/)) {
          // Check for numbered list: 1.
          shouldConvert = true;
          newBlockType = 'list';
          newBlockData = { style: 'ordered', items: [''] };
        } else if (text === '>') {
          // Check for quote: >
          shouldConvert = true;
          newBlockType = 'quote';
          newBlockData = { text: '', caption: '' };
        }
        
        if (shouldConvert) {
          e.preventDefault(); // Prevent the space from being added
          
          try {
            const currentBlockIndex = editorRef.current.blocks.getCurrentBlockIndex();
            const currentBlock = await editorRef.current.blocks.getBlockByIndex(currentBlockIndex);
            
            if (currentBlock) {
              // Clear the current block content
              target.textContent = '';
              
              // Convert the block
              await editorRef.current.blocks.convert(currentBlock.id, newBlockType, newBlockData);
              
              // Focus the converted block after a short delay
              setTimeout(() => {
                const blocks = editorElement.querySelectorAll('.ce-block');
                const convertedBlock = blocks[currentBlockIndex];
                if (convertedBlock) {
                  const editableElement = convertedBlock.querySelector('[contenteditable="true"]');
                  if (editableElement) {
                    (editableElement as HTMLElement).focus();
                    // Place cursor at the end
                    const range = document.createRange();
                    const sel = window.getSelection();
                    range.selectNodeContents(editableElement);
                    range.collapse(false);
                    sel?.removeAllRanges();
                    sel?.addRange(range);
                  }
                }
              }, 50);
            }
          } catch (error) {
            console.error('Error converting block:', error);
          }
        }
      }
    });
  };

  useEffect(() => {
    if (!containerRef.current || editorRef.current) return;

    const editor = new EditorJS({
      holder: containerRef.current,
      tools: {
        header: {
          // @ts-ignore - Editor.js type compatibility
          class: Header,
          config: {
            placeholder: 'Heading',
            levels: [1, 2, 3, 4],
            defaultLevel: 1,
          },
          shortcut: 'CMD+SHIFT+H',
        },
        list: {
          // @ts-ignore
          class: List,
          inlineToolbar: true,
          config: {
            defaultStyle: 'unordered',
          },
          shortcut: 'CMD+SHIFT+L',
        },
        quote: {
          // @ts-ignore
          class: Quote,
          inlineToolbar: true,
          config: {
            quotePlaceholder: 'Enter a quote',
            captionPlaceholder: 'Quote author',
          },
          shortcut: 'CMD+SHIFT+Q',
        },
      },
      data: initialData || {
        time: Date.now(),
        blocks: [],
      },
      placeholder: 'Start writing your thoughts...',
      minHeight: 0,
      onReady: () => {
        setIsReady(true);
        // Add markdown-style shortcuts
        addMarkdownShortcuts();
        
        // Apply custom styles directly to Editor.js elements after render
        applyCustomStyles();
        
        // Set up MutationObserver to reapply styles when DOM changes
        if (containerRef.current) {
          const observer = new MutationObserver(() => {
            applyCustomStyles();
          });
          
          observer.observe(containerRef.current, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'data-level']
          });
        }
      },
      onChange: () => {
        // Reapply styles on content change to ensure new blocks get styled
        setTimeout(() => applyCustomStyles(), 100);
      },
    });

    editorRef.current = editor;

    return () => {
      if (editorRef.current && editorRef.current.destroy) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
      setIsReady(false);
    };
  }, []);

  // Function to apply inline styles directly to override everything
  const applyCustomStyles = () => {
    if (!containerRef.current) return;

    console.log('Applying custom styles...');

    // Style headers with inline styles - target ALL elements inside headers too
    const headers = containerRef.current.querySelectorAll('.ce-header');
    console.log('Found headers:', headers.length);
    
    headers.forEach((header) => {
      let level = header.getAttribute('data-level');
      const element = header as HTMLElement;
      
      // If no data-level attribute, check the tag name (h1, h2, h3, h4)
      if (!level && element.tagName) {
        const tagName = element.tagName.toLowerCase();
        if (tagName === 'h1') level = '1';
        else if (tagName === 'h2') level = '2';
        else if (tagName === 'h3') level = '3';
        else if (tagName === 'h4') level = '4';
      }
      
      console.log('Styling header level:', level, 'tagName:', element.tagName, element);
      
      // Apply to the header container
      element.style.cssText = 'padding: 0.4em 0; margin: 0; line-height: 1.25; font-weight: bold;';
      
      let fontSize = '16px';
      let fontWeight = 'bold';
      let marginTop = '0';
      let marginBottom = '0';
      let letterSpacing = '0';
      
      if (level === '1') {
        fontSize = '32px';  // H1
        fontWeight = '700';
        marginTop = '0.5em';
        marginBottom = '0.3em';
        letterSpacing = '-0.01em';
      } else if (level === '2') {
        fontSize = '28px';  // H2
        fontWeight = '600';
        marginTop = '0.5em';
        marginBottom = '0.3em';
        letterSpacing = '-0.01em';
      } else if (level === '3') {
        fontSize = '24px';  // H3
        fontWeight = '600';
        marginTop: '0.4em';
        marginBottom = '0.2em';
      } else if (level === '4') {
        fontSize = '20px';  // H4
        fontWeight = '600';
        marginTop = '0.3em';
        marginBottom = '0.2em';
      }
      
      element.style.fontSize = fontSize;
      element.style.fontWeight = fontWeight;
      element.style.marginTop = marginTop;
      element.style.marginBottom = marginBottom;
      element.style.letterSpacing = letterSpacing;
      
      console.log('Applied fontSize:', fontSize, 'to element:', element);
      
      // CRITICAL: Also apply to ALL child elements (h1, h2, h3, h4, div, span, etc.)
      const allChildren = element.querySelectorAll('*');
      allChildren.forEach((child) => {
        const childElement = child as HTMLElement;
        childElement.style.fontSize = fontSize;
        childElement.style.fontWeight = fontWeight;
        childElement.style.letterSpacing = letterSpacing;
      });
    });

    // Style paragraphs
    const paragraphs = containerRef.current.querySelectorAll('.ce-paragraph');
    paragraphs.forEach((p) => {
      const element = p as HTMLElement;
      element.style.lineHeight = '1.7';
      element.style.fontSize = '1.05em';
    });

    // Style lists
    const lists = containerRef.current.querySelectorAll('.cdx-list');
    console.log('Found lists:', lists.length);
    lists.forEach((list) => {
      const element = list as HTMLElement;
      element.style.paddingLeft = '1.5em';
    });

    const listItems = containerRef.current.querySelectorAll('.cdx-list__item');
    console.log('Found list items:', listItems.length);
    listItems.forEach((item) => {
      const element = item as HTMLElement;
      element.style.padding = '0.05em 0';
      element.style.lineHeight = '1.1';
      element.style.paddingLeft = '12px';  // Add space for bigger bullet
      console.log('Styled list item:', element);
    });
    
    // Check for unordered lists specifically
    const unorderedLists = containerRef.current.querySelectorAll('.cdx-list--unordered');
    console.log('Found unordered lists:', unorderedLists.length);
    const unorderedItems = containerRef.current.querySelectorAll('.cdx-list--unordered .cdx-list__item');
    console.log('Found unordered list items:', unorderedItems.length);
    
    // Also check the parent ul element
    const ulElements = containerRef.current.querySelectorAll('ul.cdx-list');
    console.log('Found UL elements:', ulElements.length);
    ulElements.forEach((ul) => {
      console.log('UL classes:', ul.className);
    });

    // For unordered lists, we can't directly style ::before with inline styles
    // but we can ensure the CSS is strong enough
    const styleId = 'editorjs-bullets-v4';
    const existingStyle = document.getElementById(styleId);
    if (existingStyle) {
      console.log('Removing existing bullet style');
      existingStyle.remove();  // Remove old version
    }
    
    console.log('Injecting new bullet style');
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* Target ALL unordered lists, not just with --unordered modifier */
      ul.cdx-list .cdx-list__item::before,
      .cdx-list--unordered .cdx-list__item::before {
        content: '' !important;
        position: absolute !important;
        left: 0 !important;
        top: 0.85em !important;
        width: 8px !important;
        height: 8px !important;
        background: #000 !important;
        border-radius: 50% !important;
        display: block !important;
      }
      
      ul.cdx-list .cdx-list__item,
      .cdx-list--unordered .cdx-list__item {
        position: relative !important;
        list-style: none !important;
      }
    `;
    document.head.appendChild(style);
    console.log('Bullet style injected');
  };

  // Update editor data when initialData changes
  useEffect(() => {
    if (!editorRef.current || !isReady || !initialData) return;

    // Render the new data
    editorRef.current.render(initialData).catch(err => {
      console.error('Failed to render editor data:', err);
    });
  }, [initialData, isReady]);

  const handleSave = async () => {
    if (!editorRef.current) return;

    setError(null);

    try {
      const outputData = await editorRef.current.save();
      console.log('💾 Saving text content:', { storagePath, blocks: outputData.blocks.length });

      // Upload to Firebase Storage
      const fileRef = storageRef(storage, storagePath);
      await uploadString(fileRef, JSON.stringify(outputData), 'raw', {
        contentType: 'application/json',
      });

      console.log('✅ Text content saved successfully');
      onSave?.(outputData);
    } catch (err) {
      console.error('Failed to save:', err);
      setError('Failed to save. Please try again.');
      throw err; // Re-throw so parent can handle it
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Editor Container */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div ref={containerRef} className="max-w-none" />
      </div>
      {error && (
        <div className="px-6 pb-4 text-sm text-red-600">
          {error}
        </div>
      )}
    </div>
  );
});

export default TextEditor;
