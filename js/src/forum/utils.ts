import app from 'flarum/forum/app';

export const BLOG_SLUG = 'blog';
export const ARTICLE_SLUG = 'article';

// Short helper for translator lookups. Returns the translated string, or the
// key itself if no translation is registered (Flarum's default fallback
// behaviour). All forum-side strings live under 'linkrobins-blog.forum.*'.
// Named tr() so it doesn't shadow local 't' variables.
export function tr(key: string, params?: Record<string, any>): any {
  try {
    return app.translator.trans(`linkrobins-blog.${key}`, params || {});
  } catch (e) {
    return key;
  }
}

// Reads a forum attribute that works both at initializer time (before
// app.forum is built — straight from the boot payload) and at render time.
export function readForumAttribute(key: string): any {
  try {
    const fa = app.data && (app.data as any).resources;
    if (Array.isArray(fa)) {
      for (const resource of fa) {
        if (resource && resource.type === 'forums' && resource.attributes && key in resource.attributes) {
          return resource.attributes[key];
        }
      }
    }
  } catch (e) {
    // fall through to app.forum
  }
  try {
    if (app.forum && typeof app.forum.attribute === 'function') {
      return app.forum.attribute(key);
    }
  } catch (e) {
    // not booted yet
  }
  return null;
}

export function siteTitle(): string {
  const t = readForumAttribute('linkrobinsBlogTitle');
  if (typeof t === 'string' && t.trim() !== '') return t.trim();
  return readForumAttribute('title') || tr('forum.blog');
}

export function siteTagline(): string {
  const t = readForumAttribute('linkrobinsBlogTagline');
  if (typeof t === 'string' && t.trim() !== '') return t.trim();
  return '';
}

export function postsPerPage(): number {
  const p = parseInt(readForumAttribute('linkrobinsBlogPostsPerPage'), 10);
  if (!isNaN(p) && p > 0 && p <= 50) return p;
  return 12;
}

export function navLabel(): string {
  const v = readForumAttribute('linkrobinsBlogNavLabel');
  if (typeof v === 'string' && v.trim() !== '') return v.trim();
  return tr('forum.blog');
}

export function navIcon(): string {
  const v = readForumAttribute('linkrobinsBlogNavIcon');
  if (typeof v === 'string' && v.trim() !== '') return v.trim();
  return 'fas fa-feather-alt';
}

export function blogIndexRoute(): string {
  return `/${BLOG_SLUG}`;
}

export function isBlogHomepage(): boolean {
  return readForumAttribute('defaultRoute') === blogIndexRoute();
}

// Drafts route detection. We use Mithril's m.route.get() rather than
// window.location because m.route.get() reflects Mithril's current route
// regardless of how Flarum is mounted (history vs hash).
export function isDraftsRoute(): boolean {
  try {
    const route = (typeof m !== 'undefined' && m.route && m.route.get && m.route.get()) || '';
    if (typeof route !== 'string') return false;
    // Match /blog/drafts or /blog/drafts?... or /blog/drafts/...
    // Avoid matching /blog/drafts-something or /blog/draftsomething.
    return /^\/blog\/drafts(\/|\?|$)/.test(route);
  } catch (e) {
    return false;
  }
}

// Build a dated URL slug: "2026-05-13-my-post-title".
export function datedSlugFor(post: any): string {
  const attr = (post && post.attributes) || {};
  const bareSlug = attr.slug || (post && post.id) || '';
  const iso = attr.publishedAt || attr.createdAt || null;
  if (!iso) return bareSlug;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return bareSlug;
    const y = d.getUTCFullYear();
    const mo = `0${d.getUTCMonth() + 1}`.slice(-2);
    const dy = `0${d.getUTCDate()}`.slice(-2);
    return `${y}-${mo}-${dy}-${bareSlug}`;
  } catch (e) {
    return bareSlug;
  }
}

// Strip an optional leading "YYYY-MM-DD-" prefix from a URL segment.
export function stripDatePrefix(s: any): any {
  if (typeof s !== 'string') return s;
  return s.replace(/^\d{4}-\d{2}-\d{2}-/, '');
}

export function applyBlogBodyClass(on: boolean): void {
  const el = document.documentElement;
  if (!el) return;
  if (on) el.classList.add('LinkRobinsBlogActive');
  else el.classList.remove('LinkRobinsBlogActive');
}

export function basePath(): string {
  try {
    return (app.forum && app.forum.attribute && app.forum.attribute('basePath')) || '';
  } catch (e) {
    return '';
  }
}

export function safeNavigate(href: any, ev?: any): void {
  if (ev && (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button === 1)) return;

  // Refuse to route anything that isn't an in-app path. We expect href to be
  // either:
  //   - basePath + "/something" (the usual case from our own builders)
  //   - "/something" (already a bare path)
  // If a caller ever passes "https://evil.example/x" or a "javascript:" URL
  // by mistake, slicing basePath off it would produce a garbage string that
  // m.route.set might still navigate to. Bail out instead.
  if (typeof href !== 'string' || href === '') return;

  const base = basePath();
  let path: string;
  if (base && href.indexOf(base) === 0) {
    path = href.slice(base.length) || '/';
  } else if (href.charAt(0) === '/') {
    path = href;
  } else {
    // Not an internal path — let the browser handle it as a normal <a href>
    // click (we deliberately don't preventDefault).
    return;
  }

  // Reject anything that doesn't look like a clean root-relative path
  // (paranoia: "//evil.example/..." is a scheme-relative URL the browser
  // would happily navigate to).
  if (path.charAt(0) !== '/' || path.charAt(1) === '/') return;

  if (ev) ev.preventDefault();
  m.route.set(path);
}

export function formatDate(iso: any): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (e) {
    return '';
  }
}

export function postPath(post: any): string {
  return `/${ARTICLE_SLUG}/${datedSlugFor(post)}`;
}

export function userPath(user: any): string | null {
  if (!user || !user.attributes) return null;
  const name = user.attributes.slug || user.attributes.username;
  if (!name) return null;
  return `/u/${encodeURIComponent(name)}`;
}

export function categoryPath(category: any): string {
  const slug = (category && category.attributes && category.attributes.slug) || (category && category.id);
  return `/category/${slug}`;
}

export function slugify(s: any): string {
  return String(s || '')
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
}

export function insertAtCursor(textarea: HTMLTextAreaElement | null, before: string, after: string, placeholder?: string): void {
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  const selected = value.slice(start, end) || placeholder || '';
  textarea.value = value.slice(0, start) + before + selected + after + value.slice(end);
  try {
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  } catch (e) {
    // synthetic input event unsupported — value is still set
  }
  const cursorStart = start + before.length;
  const cursorEnd = cursorStart + selected.length;
  try {
    textarea.focus();
    textarea.setSelectionRange(cursorStart, cursorEnd);
  } catch (e) {
    // focus can fail if the textarea was detached mid-action
  }
}

export function openLogIn(): void {
  try {
    const btn =
      document.querySelector<HTMLElement>('.Header-controls .Button.Button--link') ||
      document.querySelector<HTMLElement>('.Header-controls a[href*="login"]') ||
      document.querySelector<HTMLElement>(
        'header.App-header .Header-controls li:last-child a, header.App-header .Header-controls li:last-child button'
      );
    if (btn) {
      btn.click();
      return;
    }
    m.route.set('/');
  } catch (e) {
    // no login affordance found — stay put
  }
}

export function findIncluded(included: any[], type: string, id: any): any {
  if (!included || !id) return null;
  for (const item of included) {
    if (item.type === type && String(item.id) === String(id)) return item;
  }
  return null;
}

export function relatedUser(post: any, included: any[]): any {
  const rel = post.relationships && post.relationships.user && post.relationships.user.data;
  if (!rel) return null;
  return findIncluded(included, 'users', rel.id);
}

export function relatedCategory(post: any, included: any[]): any {
  const rel = post.relationships && post.relationships.category && post.relationships.category.data;
  if (!rel) return null;
  return findIncluded(included, 'linkrobins-blog-categories', rel.id);
}

export function canCreateBlogPost(): boolean {
  try {
    if (!app.session || !app.session.user) return false;
    if (typeof app.session.user.isAdmin === 'function' && app.session.user.isAdmin()) return true;
    return !!readForumAttribute('canCreateBlogPost');
  } catch (e) {
    return false;
  }
}

export function canModerateBlogPosts(): boolean {
  try {
    if (!app.session || !app.session.user) return false;
    if (typeof app.session.user.isAdmin === 'function' && app.session.user.isAdmin()) return true;
    return !!readForumAttribute('canModerateBlogPosts');
  } catch (e) {
    return false;
  }
}

export function canEditBlogPost(post: any): boolean {
  if (canModerateBlogPosts()) return true;
  if (!canCreateBlogPost()) return false;
  try {
    if (!app.session || !app.session.user) return false;
    const rel = post && post.relationships && post.relationships.user && post.relationships.user.data;
    if (!rel) return false;
    return String(rel.id) === String(app.session.user.id());
  } catch (e) {
    return false;
  }
}
