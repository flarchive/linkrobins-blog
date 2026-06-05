import app from 'flarum/forum/app';
import Avatar from 'flarum/common/components/Avatar';
import ComposerPostPreview from 'flarum/forum/components/ComposerPostPreview';
import username from 'flarum/common/helpers/username';

// --- Real composer integration --------------------------------------------
// Drive Flarum's real docked composer (app.composer) for the post body
// instead of embedding TextEditor inline — that's the environment FoF Rich
// Text, FoF Upload, Mentions and Emoji are built for, so they all work as in
// a normal forum reply. Core ships ComposerBody in a lazily-loaded chunk
// (registered via flarum.reg.addChunkModule, not eagerly), so it MUST be
// resolved on demand (asyncModuleImport) and cached — a static import here
// would resolve to undefined at module init.

let ComposerBodyBase: any = null;
let BlogComposerClass: any = null;
const COMPOSER_BODY_PATH = 'flarum/forum/components/ComposerBody';

// Resolve Flarum's core TextEditor — the Markdown editor (toolbar +
// @mentions) used in the composer. Returns null if unavailable, so the post
// body falls back to the plain textarea + custom toolbar.
export function getTextEditor(): any {
  try {
    const mod = flarum.reg.get('core', 'common/components/TextEditor');
    return (mod && mod.default) || mod || null;
  } catch (e) {
    return null;
  }
}

function makeBlogComposer(ComposerBody: any) {
  return class BlogComposer extends ComposerBody {
    headerItems() {
      const items = super.headerItems();
      const defs = typeof this.attrs.blogHeaderItems === 'function' ? this.attrs.blogHeaderItems(this) : null;
      if (defs && defs.length) {
        defs.forEach((d: any, i: number) => {
          if (d == null) return;
          items.add(d.name || `blog-header-${i}`, d.content, d.priority || 0);
        });
      }
      return items;
    }

    onsubmit() {
      const content = this.composer.fields.content();
      if (typeof this.attrs.onBlogSubmit === 'function') {
        this.attrs.onBlogSubmit(content, this);
      }
    }
  };
}

function ensureBlogComposer(): Promise<any> {
  if (BlogComposerClass) return Promise.resolve(BlogComposerClass);
  try {
    const loaded = flarum.reg.checkModule && flarum.reg.checkModule('core', 'forum/components/ComposerBody');
    if (loaded) {
      ComposerBodyBase = (loaded as any).default || loaded;
      BlogComposerClass = makeBlogComposer(ComposerBodyBase);
      return Promise.resolve(BlogComposerClass);
    }
  } catch (e) {
    // fall through to async import
  }
  try {
    if (flarum.reg.asyncModuleImport) {
      return flarum.reg
        .asyncModuleImport(COMPOSER_BODY_PATH)
        .then((mod: any) => {
          ComposerBodyBase = (mod && mod.default) || mod || null;
          BlogComposerClass = ComposerBodyBase ? makeBlogComposer(ComposerBodyBase) : null;
          return BlogComposerClass;
        })
        .catch((e: any) => {
          console.error('[linkrobins/blog] could not load composer chunk:', e);
          return null;
        });
    }
  } catch (e) {
    // registry unavailable
  }
  return Promise.resolve(null);
}

export function blogComposerSupported(): boolean {
  if (!app.composer || typeof app.composer.load !== 'function') return false;
  if (BlogComposerClass) return true;
  try {
    if (flarum.reg.checkModule && flarum.reg.checkModule('core', 'forum/components/ComposerBody')) return true;
    if (
      flarum.reg.chunkModules &&
      typeof flarum.reg.chunkModules.has === 'function' &&
      flarum.reg.chunkModules.has('core:forum/components/ComposerBody')
    ) {
      return true;
    }
  } catch (e) {
    // registry unavailable
  }
  return false;
}

export function openBlogComposer(attrs: any): boolean {
  if (!blogComposerSupported()) return false;
  if (!attrs.user) attrs.user = app.session && app.session.user;
  ensureBlogComposer().then((Cls: any) => {
    if (!Cls) return;
    app.composer.load(Cls, attrs).then(() => {
      app.composer.show();
    });
  });
  return true;
}

export function blogComposerOpenFor(contextKey: string): boolean {
  try {
    if (!app.composer || !app.composer.isVisible || !app.composer.isVisible()) return false;
    const bodyAttrs = app.composer.body && (app.composer.body as any).attrs;
    return !!(bodyAttrs && bodyAttrs.blogContext === contextKey);
  } catch (e) {
    return false;
  }
}

export function blogComposerContent(): string {
  try {
    if (app.composer && app.composer.fields && app.composer.fields.content) {
      return app.composer.fields.content() || '';
    }
  } catch (e) {
    // composer not mounted
  }
  return '';
}

// Render the same "reply placeholder" Flarum shows at the end of a
// discussion: a click-to-compose box, or — while the composer is open for
// this context — a live preview of the body (ComposerPostPreview).
// opts: { composing, placeholder, onclick }.
export function blogComposerPreview(opts: { composing: boolean; placeholder: any; onclick: () => void }): any {
  const user = app.session && app.session.user;

  if (opts.composing && ComposerPostPreview) {
    return m(
      'article',
      { className: 'Post CommentPost editing', 'aria-busy': 'true' },
      m('div', { className: 'Post-container' }, [
        m('div', { className: 'Post-side' }, Avatar ? m(Avatar, { user, className: 'Post-avatar' }) : null),
        m('div', { className: 'Post-main' }, [
          m(
            'header',
            { className: 'Post-header' },
            m(
              'div',
              { className: 'PostUser' },
              m('h3', { className: 'PostUser-name' }, username ? username(user) : (user && (user as any).username ? (user as any).username() : ''))
            )
          ),
          m('div', { className: 'Post-body' }, m(ComposerPostPreview, { className: 'Post-body', composer: app.composer })),
        ]),
      ])
    );
  }

  return m(
    'button',
    {
      type: 'button',
      className: 'Post ReplyPlaceholder',
      onclick: opts.onclick,
    },
    m('div', { className: 'Post-container' }, [
      m('div', { className: 'Post-side' }, Avatar ? m(Avatar, { user, className: 'Post-avatar' }) : null),
      m('div', { className: 'Post-main' }, m('span', { className: 'Post-header' }, opts.placeholder)),
    ])
  );
}

export function isFofUploadInstalled(): boolean {
  try {
    if (typeof flarum !== 'undefined' && flarum.extensions && (flarum.extensions as any)['fof-upload']) {
      return true;
    }
  } catch (e) {
    // flarum global unavailable
  }
  try {
    if (app && app.data && (app.data as any).extensions && (app.data as any).extensions['fof-upload']) {
      return true;
    }
  } catch (e) {
    // boot payload unavailable
  }
  return false;
}
