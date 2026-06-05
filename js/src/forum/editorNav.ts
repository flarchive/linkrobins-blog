import { BLOG_SLUG } from './utils';

// Stash for the post being edited, set by openPostEditor() right before it
// navigates to the editor page (so we don't need an extra fetch for the
// common in-app edit flow). Cleared once the page consumes it.
let pendingEditorPost: any = null;

export function consumePendingEditorPost(routeId: any): any {
  const stashed = pendingEditorPost && String(pendingEditorPost.id) === String(routeId) ? pendingEditorPost : null;
  pendingEditorPost = null;
  return stashed;
}

// Navigate to the post editor PAGE. `post` is the raw JSON:API resource (or
// null for a new post); when editing we stash it so the page can populate
// without an extra fetch.
export function openPostEditor(post: any): void {
  if (post && post.id) {
    pendingEditorPost = post;
    m.route.set(`/${BLOG_SLUG}/compose/${encodeURIComponent(post.id)}`);
  } else {
    pendingEditorPost = null;
    m.route.set(`/${BLOG_SLUG}/compose`);
  }
}
