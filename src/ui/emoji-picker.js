/**
 * Emoji picker — a searchable popover with categories and recents.
 */

import { h, clear } from '../core/dom.js';
import {
  EMOJI_CATEGORIES,
  QUICK_REACTIONS,
  searchEmoji,
  loadRecentEmoji,
  pushRecentEmoji,
  emojiName,
  RECENT_STORAGE_KEY,
} from './emoji.js';
import { openPopover } from './popover.js';
import { iconSvg } from './icons.js';

let activeTab = 'recent';

/**
 * Open the emoji picker.
 * @param {HTMLElement} anchor
 * @param {(emoji: string) => void} onPick
 */
export function openEmojiPicker(anchor, onPick) {
  // Start on "recent" only when there is something to show there.
  if (!loadRecentEmoji().length && activeTab === 'recent') {
    activeTab = 'smileys';
  }

  const grid = h('div', { class: 'emoji-grid' });
  const searchInput = h('input', {
    class: 'input',
    type: 'search',
    placeholder: 'Search emoji',
    'aria-label': 'Search emoji',
  });

  const tabs = h('div', { class: 'emoji-tabs', role: 'tablist' });

  const picker = h(
    'div',
    { class: 'emoji-picker' },
    h('div', { class: 'emoji-search' }, h('div', { class: 'input-group' }, h('span', { class: 'input-icon' }, iconSvg('search', { size: 15 })), searchInput)),
    tabs,
    grid,
  );

  const renderGrid = () => {
    clear(grid);
    const query = searchInput.value.trim();

    if (query) {
      const results = searchEmoji(query, 120);
      if (!results.length) {
        grid.appendChild(h('div', { class: 'emoji-category-label' }, 'No matches'));
        return;
      }
      for (const item of results) {
        grid.appendChild(
          h(
            'button',
            {
              class: 'emoji-item',
              type: 'button',
              title: item.name,
              onClick: () => {
                pushRecentEmoji(item.emoji);
                onPick(item.emoji);
              },
            },
            item.emoji,
          ),
        );
      }
      return;
    }

    // Recents first when available.
    const recents = loadRecentEmoji();
    if (recents.length && activeTab === 'recent') {
      grid.appendChild(h('div', { class: 'emoji-category-label' }, 'Recently used'));
      for (const emoji of recents) {
        grid.appendChild(
          h(
            'button',
            {
              class: 'emoji-item',
              type: 'button',
              title: emojiName(emoji) || emoji,
              onClick: () => {
                pushRecentEmoji(emoji);
                onPick(emoji);
              },
            },
            emoji,
          ),
        );
      }
      return;
    }

    // Fall back to the first category that actually has content.
    const category =
      EMOJI_CATEGORIES.find((c) => c.id === activeTab && c.items.length) ||
      EMOJI_CATEGORIES.find((c) => c.id === 'smileys') ||
      EMOJI_CATEGORIES.find((c) => c.items.length);

    if (!category) return;
    activeTab = category.id;
    grid.appendChild(h('div', { class: 'emoji-category-label' }, category.name));
    for (const item of category.items) {
      grid.appendChild(
        h(
          'button',
          {
            class: 'emoji-item',
            type: 'button',
            title: item.name,
            onClick: () => {
              pushRecentEmoji(item.emoji);
              onPick(item.emoji);
            },
          },
          item.emoji,
        ),
      );
    }
  };

  const renderTabs = () => {
    clear(tabs);
    for (const category of EMOJI_CATEGORIES) {
      const recents = category.id === 'recent' ? loadRecentEmoji() : null;
      if (recents && !recents.length) continue;
      tabs.appendChild(
        h(
          'button',
          {
            class: `emoji-tab${category.id === activeTab ? ' is-active' : ''}`,
            type: 'button',
            title: category.name,
            role: 'tab',
            'aria-selected': String(category.id === activeTab),
            onClick: () => {
              activeTab = category.id;
              renderTabs();
              renderGrid();
            },
          },
          category.icon,
        ),
      );
    }
  };

  searchInput.addEventListener('input', renderGrid);
  renderTabs();
  renderGrid();

  openPopover(anchor, picker, { align: 'start' });
  setTimeout(() => searchInput.focus(), 30);
}

export { QUICK_REACTIONS, RECENT_STORAGE_KEY };
