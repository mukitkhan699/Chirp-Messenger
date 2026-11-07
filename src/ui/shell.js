/**
 * Application shell — assembles the sidebar, chat area, composer, call
 * overlay, settings panel and the global overlays.
 */

import { h } from '../core/dom.js';
import { store, actions } from '../state/app.js';
import { mountSidebar } from './sidebar.js';
import { mountChat } from './chat.js';
import { mountComposer } from './composer.js';
import { mountCall } from './call.js';
import { mountSettings } from './settings.js';
import { mountToasts } from './toast.js';
import { mountModals } from './modal.js';
import { openConnectModal } from './dialogs.js';

export function mountShell(root) {
  // Drop the boot splash (and anything else) before mounting the real app.
  root.replaceChildren();

  const sidebar = h('aside', { class: 'sidebar', id: 'sidebar' });
  const chat = h('main', { class: 'chat', id: 'chat' });
  const app = h('div', { class: 'app' }, sidebar, chat);

  root.appendChild(app);

  const scrim = h('div', { class: 'scrim', id: 'mobile-scrim' });
  root.appendChild(scrim);

  mountSidebar(sidebar);
  mountChat(chat, { onReply: (message) => actions.setReplyTo(message) });
  const composer = mountComposer(chat);
  mountCall(root);
  mountSettings(root);
  mountToasts();
  mountModals();

  // Mobile drawer behaviour.
  const syncDrawer = () => {
    const open = store.get('ui.sidebarOpen');
    sidebar.classList.toggle('is-open', open);
    scrim.classList.toggle('is-open', open && window.innerWidth <= 900);
  };
  store.subscribe('ui.sidebarOpen', syncDrawer);
  window.addEventListener('resize', syncDrawer);
  syncDrawer();

  // On small screens, opening a conversation closes the drawer.
  store.subscribe('ui.activeConversationId', (id) => {
    if (id && id !== 'welcome' && window.innerWidth <= 900) {
      store.set('ui.sidebarOpen', false);
    }
  });

  // Global shortcuts.
  document.addEventListener('keydown', (event) => {
    const inField = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
    const mod = event.metaKey || event.ctrlKey;

    if (mod && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      const search = document.querySelector('.sidebar-search input');
      search?.focus();
      search?.select();
      return;
    }
    if (mod && event.key === ',') {
      event.preventDefault();
      actions.setPanel('settings');
      return;
    }
    if (event.key === 'Escape' && !inField) {
      // A modal that already handled Escape must not also close the panel.
      if (event.defaultPrevented) return;
      if (store.get('ui.modal')) {
        actions.closeModal();
        return;
      }
      if (store.get('ui.panel')) actions.setPanel(null);
      return;
    }
    if (!inField && !mod && event.key === '/' ) {
      event.preventDefault();
      const search = document.querySelector('.sidebar-search input');
      search?.focus();
    }
  });

  return { composer, app };
}
