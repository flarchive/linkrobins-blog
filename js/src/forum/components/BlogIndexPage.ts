import app from 'flarum/forum/app';
import Page from 'flarum/common/components/Page';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import PageStructure from 'flarum/forum/components/PageStructure';

import {
  tr,
  readForumAttribute,
  siteTitle,
  siteTagline,
  postsPerPage,
  isDraftsRoute,
  applyBlogBodyClass,
  basePath,
  safeNavigate,
  formatDate,
  postPath,
  userPath,
  blogIndexRoute,
  isBlogHomepage,
  relatedUser,
  relatedCategory,
} from '../utils';
import { fetchPosts, loadAllCategories, getAllCategoriesCache } from '../api';
import { renderBlogBlocks } from '../blocks';
import { registerBlogRefreshListener } from '../refresh';
import BlogIndexSidebar from './BlogIndexSidebar';

export default class BlogIndexPage extends Page {
  loading = true;
  loadingMore = false;
  posts: any[] = [];
  included: any[] = [];
  offset = 0;
  hasMore = true;
  category: any = null;
  error: any = null;
  mode: 'drafts' | 'index' = 'index';

  private _currentSlug: any = null;
  private _refreshUnregister: (() => void) | null = null;
  private _observer: IntersectionObserver | null = null;

  oninit(vnode: any) {
    super.oninit(vnode);
    this.mode = isDraftsRoute() ? 'drafts' : 'index';

    try {
      app.setTitle(this.mode === 'drafts' ? tr('forum.index.hero_drafts_title') : '');
      app.setTitleCount(0);
    } catch (e) {
      // title API unavailable
    }

    // Tell the tags extension to skip emitting its per-tag link list in the
    // sidebar — we still want the "Tags" entry pointing at /tags, but not the
    // long list of tag links, because this is a blog page and the blog has
    // its own categories. flarum/tags reads this flag at navItems() render
    // time. See addTagList.js in the tags extension.
    try {
      if (app.current && typeof app.current.set === 'function') {
        app.current.set('noTagsList', true);
      }
    } catch (e) {
      // PageState unavailable
    }

    this._currentSlug = (this.attrs && (this.attrs as any).slug) || null;
    this._load();
    loadAllCategories().then(() => {
      try {
        m.redraw();
      } catch (e) {
        // unmounted
      }
    });

    this._refreshUnregister = registerBlogRefreshListener(() => {
      // Save and delete both warrant a refetch of the index. We ignore
      // ev.type here — whichever happened, the list is now stale.
      this.loading = true;
      this.posts = [];
      this.included = [];
      this.offset = 0;
      this.hasMore = true;
      this._load();
    });
  }

  onupdate(vnode: any) {
    if (super.onupdate) super.onupdate(vnode);
    const newSlug = (this.attrs && (this.attrs as any).slug) || null;
    const newMode = isDraftsRoute() ? 'drafts' : 'index';
    if (newSlug !== this._currentSlug || newMode !== this.mode) {
      this._currentSlug = newSlug;
      this.mode = newMode;
      this.loading = true;
      this.posts = [];
      this.included = [];
      this.offset = 0;
      this.hasMore = true;
      this.category = null;
      try {
        app.setTitle(this.mode === 'drafts' ? tr('forum.index.hero_drafts_title') : '');
      } catch (e) {
        // title API unavailable
      }
      this._load();
    }
    this._installScrollObserver();
  }

  oncreate(vnode: any) {
    try {
      if (super.oncreate) super.oncreate(vnode);
    } catch (e) {
      console.error('[linkrobins/blog] super.oncreate threw:', e);
    }
    applyBlogBodyClass(true);
    this._installScrollObserver();
  }

  onremove(vnode: any) {
    applyBlogBodyClass(false);
    this._teardownScrollObserver();
    if (this._refreshUnregister) this._refreshUnregister();
    if (super.onremove) super.onremove(vnode);
  }

  _load() {
    let categoryId: any = null;
    const draftsOnly = this.mode === 'drafts';

    const run = () => {
      fetchPosts({
        offset: 0,
        limit: postsPerPage(),
        categoryId,
        draftsOnly,
      })
        .then((resp: any) => {
          this.posts = resp.data || [];
          this.included = resp.included || [];
          this.offset = this.posts.length;
          this.hasMore = !!(resp.links && resp.links.next);
          this.loading = false;
          m.redraw();
        })
        .catch((err: any) => {
          this.error = err;
          this.loading = false;
          console.error('[linkrobins/blog] failed to load posts:', err);
          m.redraw();
        });
    };

    // Drafts route has no category slug to resolve; skip the category lookup
    // branch even if a stale slug somehow sat on this.attrs.
    if (this._currentSlug && this.mode !== 'drafts') {
      app
        .request({
          method: 'GET',
          url: `${app.forum.attribute('apiUrl')}/linkrobins-blog-categories/${encodeURIComponent(this._currentSlug)}`,
        })
        .then((resp: any) => {
          if (resp && resp.data) {
            this.category = resp.data;
            categoryId = resp.data.id;
          }
          run();
        })
        .catch((err: any) => {
          this.error = err;
          this.loading = false;
          console.error('[linkrobins/blog] failed to load category:', err);
          m.redraw();
        });
    } else {
      run();
    }
  }

  _loadMore() {
    if (this.loading || this.loadingMore || !this.hasMore) return;
    this.loadingMore = true;
    m.redraw();

    fetchPosts({
      offset: this.offset,
      limit: postsPerPage(),
      categoryId: this.category ? this.category.id : null,
      draftsOnly: this.mode === 'drafts',
    })
      .then((resp: any) => {
        const fresh = resp.data || [];
        const seen: Record<string, boolean> = {};
        this.posts.forEach((p) => {
          seen[p.id] = true;
        });
        fresh.forEach((p: any) => {
          if (!seen[p.id]) this.posts.push(p);
        });
        if (resp.included) {
          const seenInc: Record<string, boolean> = {};
          this.included.forEach((i) => {
            seenInc[`${i.type}:${i.id}`] = true;
          });
          resp.included.forEach((i: any) => {
            if (!seenInc[`${i.type}:${i.id}`]) this.included.push(i);
          });
        }
        this.offset = this.posts.length;
        this.hasMore = !!(resp.links && resp.links.next);
        this.loadingMore = false;
        m.redraw();
      })
      .catch((err: any) => {
        this.loadingMore = false;
        console.error('[linkrobins/blog] failed to load more posts:', err);
        m.redraw();
      });
  }

  _installScrollObserver() {
    if (this._observer) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const sentinel = document.querySelector('.LinkRobinsBlog-loadMore-sentinel');
    if (!sentinel) return;

    this._observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            this._loadMore();
            break;
          }
        }
      },
      { rootMargin: '600px 0px' }
    );
    this._observer.observe(sentinel);
  }

  _teardownScrollObserver() {
    if (this._observer) {
      try {
        this._observer.disconnect();
      } catch (e) {
        // already disconnected
      }
      this._observer = null;
    }
  }

  view() {
    try {
      return this._safeView();
    } catch (e) {
      console.error('[linkrobins/blog] index view crashed:', e);
      return m('div', { className: 'LinkRobinsBlog' }, m('div', { className: 'LinkRobinsBlog-empty' }, tr('forum.index.render_failed')));
    }
  }

  _safeView() {
    let content: any;
    if (this.loading) {
      content = LoadingIndicator ? m(LoadingIndicator) : m('div', null, tr('forum.index.loading'));
    } else if (this.error) {
      content = m(
        'div',
        { className: 'LinkRobinsBlog-empty' },
        this.mode === 'drafts' ? tr('forum.index.drafts_load_failed') : tr('forum.index.load_failed')
      );
    } else if (!this.posts.length) {
      content = m(
        'div',
        { className: 'LinkRobinsBlog-empty' },
        this.mode === 'drafts' ? tr('forum.index.empty_drafts') : tr('forum.index.empty')
      );
    } else if (this.mode === 'drafts') {
      // Drafts list: no featured treatment; render every entry as a card so
      // the listing reads as a uniform queue.
      content = [
        m('div', { className: 'LinkRobinsBlog-grid LinkRobinsBlog-grid--drafts' }, this.posts.map(this._renderCard.bind(this))),
        this._renderLoadMore(),
      ];
    } else {
      const featured = this.posts[0];
      const rest = this.posts.slice(1);
      content = [
        this._renderFeatured(featured),
        m('div', { className: 'LinkRobinsBlog-grid' }, rest.map(this._renderCard.bind(this))),
        this._renderLoadMore(),
      ];
    }

    const mobileBlocks = renderBlogBlocks({ isPostPage: false }, 'LinkRobinsBlog-blocks--mobile');

    if (PageStructure) {
      return m(
        PageStructure,
        {
          className: 'IndexPage LinkRobinsBlog-page LinkRobinsBlog-page--index',
          hero: () => this._renderHero(),
          sidebar: () => this._renderSidebar(),
        },
        m('div', { className: 'LinkRobinsBlog' }, [content, mobileBlocks])
      );
    }

    // Fallback if PageStructure isn't available
    return m('div', { className: 'LinkRobinsBlog' }, [this._renderHero(), content, mobileBlocks]);
  }

  _renderSidebar() {
    try {
      const activeSlug =
        this.category && this.category.attributes ? this.category.attributes.slug || this.category.id : null;
      if (!getAllCategoriesCache()) {
        loadAllCategories().then(() => {
          try {
            m.redraw();
          } catch (e) {
            // unmounted
          }
        });
      }
      return m(BlogIndexSidebar, {
        className: 'LinkRobinsBlog-sidebar',
        activeCategorySlug: activeSlug,
        isPostPage: false,
      });
    } catch (e) {
      console.error('[linkrobins/blog] sidebar render failed:', e);
    }
    return null;
  }

  _renderHero() {
    // header_mode = 'none' suppresses the title, branding, and tagline on the
    // BLOG HOMEPAGE only. Category and Drafts pages keep their
    // context-specific titles because those tell the reader where they are,
    // which is independent of brand styling.
    const headerMode = readForumAttribute('linkrobinsBlogHeaderMode') || 'text';
    const suppressBrand = headerMode === 'none' && this.mode !== 'drafts' && !this.category;

    const tagline = this.category ? '' : siteTagline();
    let titleNode: any;
    if (this.mode === 'drafts') {
      titleNode = m('h1', { className: 'LinkRobinsBlog-hero-title' }, tr('forum.index.hero_drafts_title'));
    } else if (this.category) {
      titleNode = m('h1', { className: 'LinkRobinsBlog-hero-title' }, this.category.attributes.name);
    } else if (suppressBrand) {
      titleNode = null;
    } else {
      titleNode = this._renderHeroBranding();
    }

    const bgMode = readForumAttribute('linkrobinsBlogHeroBgMode') || 'none';
    const bgUrl = readForumAttribute('linkrobinsBlogHeroBgUrl') || '';
    let overlay = parseInt(readForumAttribute('linkrobinsBlogHeroOverlay') || '40', 10);
    if (isNaN(overlay) || overlay < 0) overlay = 0;
    if (overlay > 90) overlay = 90;
    const alpha = overlay / 100;

    let heroClass = 'LinkRobinsBlog-hero';
    let bgStyle = '';
    if (bgMode === 'image' && bgUrl) {
      heroClass += ' LinkRobinsBlog-hero--withBg';
      bgStyle = `background-image: linear-gradient(rgba(0,0,0,${alpha}), rgba(0,0,0,${alpha})), url("${String(bgUrl).replace(/"/g, '%22')}");`;
    } else if (bgMode === 'gradient') {
      heroClass += ' LinkRobinsBlog-hero--withBg LinkRobinsBlog-hero--gradient';
      bgStyle = `background-image: linear-gradient(rgba(0,0,0,${alpha}), rgba(0,0,0,${alpha})), linear-gradient(135deg, var(--primary-color, #ff7e5f), var(--secondary-color, #1a2535));`;
    }

    // When branding is suppressed AND there's no background to show, collapse
    // the hero entirely so we don't leave a dead empty strip above the post
    // grid.
    if (suppressBrand && bgMode === 'none') {
      return null;
    }
    if (suppressBrand) {
      heroClass += ' LinkRobinsBlog-hero--imageOnly';
    }

    // Determine the inner content. When branding is suppressed, we still
    // render the hero (for its background) but skip the inner text block
    // entirely.
    let taglineNode: any = null;
    if (!suppressBrand) {
      if (this.mode === 'drafts') {
        taglineNode = m('p', { className: 'LinkRobinsBlog-hero-tagline' }, tr('forum.index.hero_drafts_tagline'));
      } else if (tagline) {
        taglineNode = m('p', { className: 'LinkRobinsBlog-hero-tagline' }, tagline);
      }
    }
    const categoryDescNode =
      !suppressBrand && this.category && this.category.attributes.description
        ? m('p', { className: 'LinkRobinsBlog-hero-tagline' }, this.category.attributes.description)
        : null;

    return m(
      'header',
      { className: heroClass, style: bgStyle },
      suppressBrand
        ? null
        : m(
            'div',
            { className: 'container' },
            m('div', { className: 'LinkRobinsBlog-hero-inner' }, [titleNode, taglineNode, categoryDescNode])
          )
    );
  }

  _renderHeroBranding() {
    const mode = readForumAttribute('linkrobinsBlogHeaderMode') || 'text';
    const title = siteTitle();
    const bp = basePath();
    const heroHref = isBlogHomepage() ? `${bp}/` : bp + blogIndexRoute();

    let imgLight: any = null;
    let imgDark: any = null;

    if (mode === 'logo') {
      imgLight = app.forum && app.forum.attribute('logoUrl');
      imgDark = app.forum && app.forum.attribute('logoDarkModeUrl');
    }

    if (imgLight) {
      const nodes = [
        m('img', {
          src: imgLight,
          alt: title,
          className: `LinkRobinsBlog-hero-logo${imgDark && imgDark !== imgLight ? ' LinkRobinsBlog-hero-logo--light' : ''}`,
        }),
      ];
      if (imgDark && imgDark !== imgLight) {
        nodes.push(
          m('img', {
            src: imgDark,
            alt: title,
            className: 'LinkRobinsBlog-hero-logo LinkRobinsBlog-hero-logo--dark',
          })
        );
      }
      return m(
        'a',
        {
          href: heroHref,
          className: 'LinkRobinsBlog-hero-brand',
          onclick: (e: any) => safeNavigate(heroHref, e),
        },
        nodes
      );
    }

    return m('h1', { className: 'LinkRobinsBlog-hero-title' }, title);
  }

  _renderFeatured(post: any) {
    const attr = post.attributes;
    const author = relatedUser(post, this.included);
    const cat = relatedCategory(post, this.included);
    const cover = attr.coverImageUrl || null;
    const path = postPath(post);

    return m(
      'section',
      { className: 'LinkRobinsBlog-featured' },
      m(
        'a',
        {
          href: path,
          className: `LinkRobinsBlog-featured-card${cover ? ' has-cover' : ' no-cover'}`,
          onclick: (e: any) => safeNavigate(path, e),
          // encodeURI ensures CSS-syntax characters in the URL (quotes,
          // parens, braces, newlines) can't break out of url(...) and inject
          // extra CSS declarations.
          style: cover ? `background-image: url("${encodeURI(cover)}");` : null,
        },
        [
          m('div', { className: 'LinkRobinsBlog-featured-inner' }, [
            cat
              ? m(
                  'div',
                  { className: 'LinkRobinsBlog-tags' },
                  m('span', { className: 'LinkRobinsBlog-tag', style: `color: ${cat.attributes.color || 'inherit'}` }, cat.attributes.name)
                )
              : null,
            m('h2', { className: 'LinkRobinsBlog-featured-title' }, attr.title),
            this._renderMeta(author, attr.publishedAt || attr.createdAt, attr),
          ]),
        ]
      )
    );
  }

  _renderCard(post: any) {
    const attr = post.attributes;
    const author = relatedUser(post, this.included);
    const cat = relatedCategory(post, this.included);
    const cover = attr.coverImageUrl || null;
    const path = postPath(post);
    const isDraft = attr.isPublished === false;

    return m(
      'a',
      {
        href: path,
        className: `LinkRobinsBlog-card${isDraft ? ' LinkRobinsBlog-card--draft' : ''}`,
        onclick: (e: any) => safeNavigate(path, e),
        key: `p-${post.id}`,
      },
      [
        m('div', { className: `LinkRobinsBlog-card-cover${cover ? ' has-cover' : ' no-cover'}` }, cover ? m('img', { src: cover, alt: '', loading: 'lazy' }) : null),
        m('div', { className: 'LinkRobinsBlog-card-body' }, [
          isDraft ? m('div', { className: 'LinkRobinsBlog-card-draftBadge' }, [m('i', { className: 'fas fa-eye-slash' }), ' ', tr('forum.index.draft_badge')]) : null,
          cat
            ? m(
                'div',
                { className: 'LinkRobinsBlog-tags' },
                m('span', { className: 'LinkRobinsBlog-tag', style: `color: ${cat.attributes.color || 'inherit'}` }, cat.attributes.name)
              )
            : null,
          m('h3', { className: 'LinkRobinsBlog-card-title' }, attr.title),
          this._renderMeta(author, attr.publishedAt || attr.createdAt, attr),
        ]),
      ]
    );
  }

  _renderMeta(author: any, dateIso: any, attr: any, opts?: { allowLink?: boolean }) {
    opts = opts || {};
    const children: any[] = [];
    if (author) {
      const name = author.attributes.displayName || author.attributes.username || '';
      const href = opts.allowLink ? userPath(author) : null;
      if (href) {
        children.push(
          m(
            'a',
            {
              href,
              className: 'LinkRobinsBlog-meta-author',
              onclick: (e: any) => safeNavigate(href, e),
            },
            name
          )
        );
      } else {
        children.push(m('span', { className: 'LinkRobinsBlog-meta-author' }, name));
      }
    }
    const dateStr = formatDate(dateIso);
    if (dateStr) {
      if (children.length) children.push(m('span', { className: 'LinkRobinsBlog-meta-dot' }, '·'));
      children.push(m('span', { className: 'LinkRobinsBlog-meta-date' }, dateStr));
    }
    if (attr && attr.visibility === 'members') {
      if (children.length) children.push(m('span', { className: 'LinkRobinsBlog-meta-dot' }, '·'));
      children.push(m('span', { className: 'LinkRobinsBlog-meta-badge' }, [m('i', { className: 'fas fa-lock' }), ' ', tr('forum.index.members_badge')]));
    }
    if (!children.length) return null;
    return m('div', { className: 'LinkRobinsBlog-meta' }, children);
  }

  _renderLoadMore() {
    if (!this.hasMore && !this.loadingMore) return null;
    return m('div', { className: 'LinkRobinsBlog-loadMore' }, [
      m('div', { className: 'LinkRobinsBlog-loadMore-sentinel' }),
      this.loadingMore
        ? m('div', { className: 'LinkRobinsBlog-loadMore-spinner' }, m('i', { className: 'fas fa-spinner fa-spin' }))
        : this.hasMore
          ? m(
              'button',
              {
                type: 'button',
                className: 'Button LinkRobinsBlog-loadMore-button',
                onclick: () => this._loadMore(),
              },
              tr('forum.index.load_more')
            )
          : null,
    ]);
  }
}
