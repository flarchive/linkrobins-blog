import { readForumAttribute } from './utils';

export interface BlogBlockCtx {
  isPostPage?: boolean;
  post?: any;
}

// Sidebar blocks system. Other extensions can call
// window.LinkRobinsBlogAddBlock(id, factory, priority) to register additional
// blocks. factory(ctx) returns a Mithril vnode or null. ctx provides
// { isPostPage, post } so blocks can vary by context.
const blogBlocks: Array<{ id: string; factory: (ctx: BlogBlockCtx) => any; priority: number }> = [];

export function registerBlogBlock(id: string, factory: (ctx: BlogBlockCtx) => any, priority?: number): void {
  if (typeof id !== 'string' || typeof factory !== 'function') return;
  const existing = blogBlocks.findIndex((b) => b.id === id);
  if (existing >= 0) blogBlocks.splice(existing, 1);
  blogBlocks.push({ id, factory, priority: typeof priority === 'number' ? priority : 0 });
}

export function renderBlogBlocks(ctx: BlogBlockCtx | null, modifierClass?: string): any {
  const sorted = blogBlocks.slice().sort((a, b) => b.priority - a.priority);
  const rendered: any[] = [];
  for (const block of sorted) {
    try {
      const out = block.factory(ctx || {});
      if (out) rendered.push(out);
    } catch (e) {
      console.error('[linkrobins/blog] block failed:', block.id, e);
    }
  }
  if (!rendered.length) return null;
  return m('div', { className: `LinkRobinsBlog-blocks ${modifierClass || ''}` }, rendered);
}

// Built-in HTML widget block (driven by admin settings).
registerBlogBlock(
  'html',
  () => {
    const title = readForumAttribute('linkrobinsBlogAboutTitle');
    const html = readForumAttribute('linkrobinsBlogAboutHtml');
    if (typeof html !== 'string' || html.trim() === '') return null;
    return m('section', { className: 'LinkRobinsBlog-block LinkRobinsBlog-block--html' }, [
      title && title.trim() !== '' ? m('h4', { className: 'LinkRobinsBlog-block-title' }, title.trim()) : null,
      m('div', {
        className: 'LinkRobinsBlog-block-body',
        oncreate: (vnode: any) => {
          if (vnode.dom._lrRenderedHtml !== html) {
            vnode.dom.innerHTML = html;
            vnode.dom._lrRenderedHtml = html;
          }
        },
        onupdate: (vnode: any) => {
          if (vnode.dom._lrRenderedHtml !== html) {
            vnode.dom.innerHTML = html;
            vnode.dom._lrRenderedHtml = html;
          }
        },
      }),
    ]);
  },
  100
);

try {
  (window as any).LinkRobinsBlogAddBlock = registerBlogBlock;
} catch (e) {
  // window unavailable (SSR/test) — extension blocks just won't register
}
