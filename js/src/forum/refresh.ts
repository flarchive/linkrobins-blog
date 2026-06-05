import app from 'flarum/forum/app';

import { tr } from './utils';

// Refresh-listener registry. Each mounted blog page (index or article)
// registers itself on oninit and unregisters on onremove. When a post save
// fires, we broadcast to every current listener — which re-runs its own
// _load() to repopulate state from the API.
//
// This is preferable to having the editor try to reach back into "the current
// page", because the current page might be an index, a category index, or an
// article — and each one knows best how to refresh itself.
const refreshListeners: Array<(ev: any) => void> = [];

export function registerBlogRefreshListener(fn: (ev: any) => void): () => void {
  if (typeof fn !== 'function') return () => {};
  refreshListeners.push(fn);
  return function unregister() {
    const i = refreshListeners.indexOf(fn);
    if (i >= 0) refreshListeners.splice(i, 1);
  };
}

// Wraps Flarum's alert manager in a way that's safe to call from any
// delete/save handler. Auto-dismisses after a short delay so the user doesn't
// have to click through.
export function showBlogAlert(type: string, message: any): void {
  try {
    if (!app.alerts || typeof app.alerts.show !== 'function') return;
    const key = app.alerts.show({ type }, message);
    setTimeout(() => {
      try {
        app.alerts.dismiss(key);
      } catch (e) {
        // already dismissed
      }
    }, 4000);
  } catch (e) {
    // alert manager unavailable
  }
}

export function broadcastBlogRefresh(event?: { type: 'save' | 'delete'; postId?: any }): void {
  // Listeners can inspect the event to behave differently for deletes
  // (e.g. an article page on the deleted post doesn't try to refetch a
  // 404'd resource).
  const ev = event || { type: 'save' };

  // Slice so listeners that unregister themselves during the call (e.g. an
  // article page navigating away on its own post deletion) don't corrupt
  // iteration.
  const current = refreshListeners.slice();
  for (const listener of current) {
    try {
      listener(ev);
    } catch (e) {
      console.error('[linkrobins/blog] refresh listener failed:', e);
    }
  }
  try {
    m.redraw();
  } catch (e) {
    // redraw outside a mounted app is a no-op
  }

  // User-facing confirmation. We toast at the broadcast site rather than from
  // each listener so the message fires regardless of which blog view is
  // mounted (or none — e.g. deletion of a post while on /some-other-page).
  // Saves are usually followed by the editor closing on a visible blog
  // list/article — no toast needed, the UI changes are their own feedback.
  if (ev.type === 'delete') {
    showBlogAlert('success', tr('forum.post.delete_success'));
  }
}
