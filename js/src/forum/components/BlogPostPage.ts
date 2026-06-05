import app from 'flarum/forum/app';
import Page from 'flarum/common/components/Page';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import PageStructure from 'flarum/forum/components/PageStructure';

import {
  tr,
  stripDatePrefix,
  applyBlogBodyClass,
  safeNavigate,
  formatDate,
  userPath,
  categoryPath,
  relatedUser,
  relatedCategory,
  canEditBlogPost,
  openLogIn,
  ARTICLE_SLUG,
} from '../utils';
import { fetchPost, deleteBlogPost, loadAllCategories, getAllCategoriesCache } from '../api';
import { renderBlogBlocks } from '../blocks';
import { registerBlogRefreshListener, broadcastBlogRefresh, showBlogAlert } from '../refresh';
import { openPostEditor } from '../editorNav';
import BlogIndexSidebar from './BlogIndexSidebar';

export default class BlogPostPage extends Page {
  loading = true;
  error: any = null;
  post: any = null;
  included: any[] = [];
  // The comment thread lives in a normal Flarum discussion. We fetch the
  // discussion record only to get its canonical route for the "Read more
  // comments" link; the displayed count comes from attr.commentCount
  // (live-computed server-side on every post fetch). The full conversation
  // is one click away.
  discussion: any = null;
  commentsLoading = false;

  private _currentSlug: any = null;
  private _refreshUnregister: (() => void) | null = null;
  private _manageMenuOpen = false;

  oninit(vnode: any) {
    super.oninit(vnode);

    this._currentSlug = stripDatePrefix((this.attrs && (this.attrs as any).slug) || null);

    // Same as BlogIndexPage: tell flarum/tags to skip the per-tag list in
    // the sidebar when on a blog article page.
    try {
      if (app.current && typeof app.current.set === 'function') {
        app.current.set('noTagsList', true);
      }
    } catch (e) {
      // PageState unavailable
    }

    this._load();

    this._refreshUnregister = registerBlogRefreshListener((ev: any) => {
      if (ev && ev.type === 'delete') {
        // The broadcast itself toasts on delete. Article view stays put with
        // stale data on screen; the post is gone, but the loaded view is
        // harmless. (If we tried to navigate away, we'd hit the
        // homepage-is-blog-index no-op problem.)
        return;
      }

      // Save event: refresh in-place. The slug may have changed (if the
      // author edited it), so we re-derive it from the current route attrs
      // at refresh time.
      const nextSlug = stripDatePrefix((this.attrs && (this.attrs as any).slug) || null);
      if (nextSlug) {
        this._currentSlug = nextSlug;
        this.loading = true;
        this.post = null;
        this.discussion = null;
        this._load();
      }
    });
  }

  onupdate(vnode: any) {
    if (super.onupdate) super.onupdate(vnode);
    const newSlug = stripDatePrefix((this.attrs && (this.attrs as any).slug) || null);
    if (newSlug !== this._currentSlug) {
      this._currentSlug = newSlug;
      this.loading = true;
      this.post = null;
      this.discussion = null;
      this._load();
    }
  }

  oncreate(vnode: any) {
    try {
      if (super.oncreate) super.oncreate(vnode);
    } catch (e) {
      console.error('[linkrobins/blog] super.oncreate threw:', e);
    }
    applyBlogBodyClass(true);
  }

  onremove(vnode: any) {
    applyBlogBodyClass(false);
    if (this._refreshUnregister) this._refreshUnregister();
    if (super.onremove) super.onremove(vnode);
  }

  _load() {
    if (!this._currentSlug) {
      this.loading = false;
      this.error = new Error('no slug');
      return;
    }
    fetchPost(this._currentSlug)
      .then((resp: any) => {
        this.post = resp.data;
        this.included = resp.included || [];
        this.loading = false;
        try {
          const t = this.post && this.post.attributes && this.post.attributes.title;
          if (t) app.setTitle(t);
        } catch (e) {
          // title API unavailable
        }
        m.redraw();
        this._loadDiscussion();
      })
      .catch((err: any) => {
        this.error = err;
        this.loading = false;
        console.error('[linkrobins/blog] failed to load post:', err);
        m.redraw();
      });
  }

  _loadDiscussion() {
    if (!this.post) return;
    const attr = this.post.attributes || {};
    const discussionId = attr.discussionId;
    if (!discussionId) {
      // No comment discussion for this post — it's either unpublished or has
      // comments disabled. Nothing to load.
      this.discussion = null;
      this.commentsLoading = false;
      m.redraw();
      return;
    }
    this.commentsLoading = true;
    m.redraw();

    // Fetch only the discussion record so we have its canonical route
    // (/d/{id}-{slug}) for the "Read more comments" link. The displayed
    // comment count comes from attr.commentCount, which is computed live
    // server-side on every blog-post fetch — so we never need the actual
    // posts here. Anyone wanting to read or reply clicks through to the
    // discussion itself.
    app.store
      .find('discussions', String(discussionId))
      .then((discussion: any) => {
        this.discussion = discussion;
        this.commentsLoading = false;
        m.redraw();
      })
      .catch((err: any) => {
        this.commentsLoading = false;
        this.discussion = null;
        console.error('[linkrobins/blog] failed to load comment discussion:', err);
        m.redraw();
      });
  }

  view() {
    try {
      return this._safeView();
    } catch (e) {
      console.error('[linkrobins/blog] post view crashed:', e);
      return m(
        'div',
        { className: 'LinkRobinsBlog LinkRobinsBlog--post' },
        m('div', { className: 'LinkRobinsBlog-empty' }, tr('forum.post.render_failed'))
      );
    }
  }

  _safeView() {
    let content: any;
    if (this.loading) {
      content = LoadingIndicator ? m(LoadingIndicator) : m('div', null, tr('forum.index.loading'));
    } else if (this.error || !this.post) {
      content = m('div', { className: 'LinkRobinsBlog-empty' }, tr('forum.post.not_found'));
    } else {
      const attr = this.post.attributes;
      const author = relatedUser(this.post, this.included);
      const cat = relatedCategory(this.post, this.included);
      const cover = attr.coverImageUrl || null;
      content = [
        m('article', { className: 'LinkRobinsBlog-post' }, [
          m('header', { className: 'LinkRobinsBlog-post-header' }, [
            cat
              ? m(
                  'div',
                  { className: 'LinkRobinsBlog-tags LinkRobinsBlog-post-tags' },
                  m(
                    'a',
                    {
                      href: categoryPath(cat),
                      className: 'LinkRobinsBlog-tag',
                      style: `color: ${cat.attributes.color || 'inherit'}`,
                      onclick: (e: any) => safeNavigate(categoryPath(cat), e),
                    },
                    cat.attributes.name
                  )
                )
              : null,
            attr.isPublished === false
              ? m('div', { className: 'LinkRobinsBlog-post-draftBadge' }, [m('i', { className: 'fas fa-eye-slash' }), ' ', tr('forum.index.draft_badge')])
              : null,
            m('h1', { className: 'LinkRobinsBlog-post-title' }, attr.title),
            attr.excerpt && attr.excerpt.trim() ? m('p', { className: 'LinkRobinsBlog-post-excerpt' }, attr.excerpt) : null,
            this._renderPostMeta(author, attr),
            this._renderManageMenu(),
          ]),
          cover
            ? m('div', { className: 'LinkRobinsBlog-post-cover' }, [
                m('img', { src: cover, alt: attr.title }),
                attr.coverImageCredit && String(attr.coverImageCredit).trim() !== ''
                  ? m(
                      'div',
                      { className: 'LinkRobinsBlog-post-coverCredit' },
                      attr.coverImageCreditUrl && /^https?:\/\//i.test(String(attr.coverImageCreditUrl))
                        ? m(
                            'a',
                            {
                              href: String(attr.coverImageCreditUrl),
                              target: '_blank',
                              rel: 'noopener noreferrer',
                            },
                            String(attr.coverImageCredit)
                          )
                        : String(attr.coverImageCredit)
                    )
                  : null,
              ])
            : null,
          this._renderBody(attr),
        ]),
        this._renderCommentsSection(attr),
        this._renderRelatedPosts(attr),
      ];
    }

    if (PageStructure) {
      return m(
        PageStructure,
        {
          className: 'LinkRobinsBlog-page LinkRobinsBlog-page--post',
          sidebar: () => this._renderSidebar(),
        },
        m('div', { className: 'LinkRobinsBlog LinkRobinsBlog--post' }, [content, this._renderMobileBlocks()])
      );
    }

    return m('div', { className: 'LinkRobinsBlog LinkRobinsBlog--post' }, [content, this._renderMobileBlocks()]);
  }

  _renderMobileBlocks() {
    if (!this.post) return null;
    return renderBlogBlocks({ isPostPage: true, post: this.post }, 'LinkRobinsBlog-blocks--mobile');
  }

  _renderSidebar() {
    try {
      const cat = this.post ? relatedCategory(this.post, this.included) : null;
      const activeSlug = cat && cat.attributes ? cat.attributes.slug || cat.id : null;
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
        isPostPage: true,
      });
    } catch (e) {
      console.error('[linkrobins/blog] sidebar render failed:', e);
    }
    return null;
  }

  _renderPostMeta(author: any, attr: any) {
    const children: any[] = [];
    if (author) {
      const av = author.attributes.avatarUrl;
      const name = author.attributes.displayName || author.attributes.username || '';
      const href = userPath(author);

      if (av) {
        if (href) {
          children.push(
            m(
              'a',
              {
                href,
                className: 'LinkRobinsBlog-post-meta-avatarLink',
                onclick: (e: any) => safeNavigate(href, e),
              },
              m('img', { src: av, alt: '', className: 'LinkRobinsBlog-post-meta-avatar' })
            )
          );
        } else {
          children.push(m('img', { src: av, alt: '', className: 'LinkRobinsBlog-post-meta-avatar' }));
        }
      }

      if (href) {
        children.push(
          m(
            'a',
            {
              href,
              className: 'LinkRobinsBlog-post-meta-author',
              onclick: (e: any) => safeNavigate(href, e),
            },
            name
          )
        );
      } else {
        children.push(m('span', { className: 'LinkRobinsBlog-post-meta-author' }, name));
      }
    }
    const dateStr = formatDate(attr.publishedAt || attr.createdAt);
    if (dateStr) {
      if (children.length) children.push(m('span', { className: 'LinkRobinsBlog-meta-dot' }, '·'));
      children.push(m('span', { className: 'LinkRobinsBlog-post-meta-date' }, dateStr));
    }
    if (attr.visibility === 'members') {
      if (children.length) children.push(m('span', { className: 'LinkRobinsBlog-meta-dot' }, '·'));
      children.push(m('span', { className: 'LinkRobinsBlog-meta-badge' }, [m('i', { className: 'fas fa-lock' }), ' ', tr('forum.index.members_badge')]));
    }
    return m('div', { className: 'LinkRobinsBlog-post-meta' }, children);
  }

  _renderManageMenu() {
    if (!this.post) return null;
    if (!canEditBlogPost(this.post)) return null;

    // Toggle wiring uses a one-shot document listener installed on open so a
    // click anywhere outside the menu collapses it.
    const setOpen = (next: boolean) => {
      this._manageMenuOpen = next;
      if (next) {
        const handler = (ev: any) => {
          try {
            if (ev && ev.target && ev.target.closest && ev.target.closest('.LinkRobinsBlog-manageMenu')) {
              return;
            }
          } catch (e) {
            // closest() unavailable — close anyway
          }
          this._manageMenuOpen = false;
          document.removeEventListener('click', handler, true);
          try {
            m.redraw();
          } catch (e) {
            // unmounted
          }
        };
        setTimeout(() => {
          document.addEventListener('click', handler, true);
        }, 0);
      }
      try {
        m.redraw();
      } catch (e) {
        // unmounted
      }
    };

    const items = [
      m(
        'button',
        {
          type: 'button',
          className: 'LinkRobinsBlog-manageMenu-item',
          onclick: () => {
            setOpen(false);
            openPostEditor(this.post);
          },
        },
        [m('i', { className: 'fas fa-pencil-alt' }), ` ${tr('forum.post.manage_edit_post')}`]
      ),
      m(
        'button',
        {
          type: 'button',
          className: 'LinkRobinsBlog-manageMenu-item LinkRobinsBlog-manageMenu-item--danger',
          onclick: () => {
            setOpen(false);
            const attr = this.post.attributes || {};
            let ok = false;
            try {
              ok = window.confirm(tr('forum.edit_post.delete_confirm', { title: attr.title || tr('forum.post.this_post') }));
            } catch (e) {
              // confirm blocked — treat as cancel
            }
            if (!ok) return;
            const deletedId = this.post.id;
            deleteBlogPost(deletedId)
              .then(() => {
                // Broadcast carries the delete event; the article page's own
                // listener handles the success toast. We don't try to
                // navigate away because the index route may equal the
                // current path (when blog is the site homepage), making
                // m.route.set a no-op.
                broadcastBlogRefresh({ type: 'delete', postId: deletedId });
              })
              .catch((err: any) => {
                console.error('[linkrobins/blog] delete failed:', err);
                showBlogAlert('error', tr('forum.post.delete_failed'));
              });
          },
        },
        [m('i', { className: 'fas fa-trash' }), ` ${tr('forum.post.manage_delete_post')}`]
      ),
    ];

    return m('div', { className: `LinkRobinsBlog-manageMenu${this._manageMenuOpen ? ' is-open' : ''}` }, [
      m(
        'button',
        {
          type: 'button',
          className: 'Button Button--default Button--more LinkRobinsBlog-manageMenu-trigger',
          'aria-haspopup': 'menu',
          'aria-expanded': this._manageMenuOpen ? 'true' : 'false',
          'aria-label': tr('forum.post.manage_post_aria'),
          title: tr('forum.post.manage_post_aria'),
          onclick: (ev: any) => {
            ev.stopPropagation();
            setOpen(!this._manageMenuOpen);
          },
        },
        m('i', { className: 'icon fas fa-ellipsis-h' })
      ),
      this._manageMenuOpen ? m('div', { className: 'LinkRobinsBlog-manageMenu-popover', role: 'menu' }, items) : null,
    ]);
  }

  _renderBody(attr: any) {
    if (attr.canViewBody === false) {
      return this._renderMemberWall(attr);
    }
    const html = attr.contentHtml || '';
    // Only (re)set innerHTML when the content actually changed — resetting on
    // every redraw would rebuild the DOM each time and wipe anything other
    // extensions (e.g. linkrobins/toc) added inside the body.
    const setHtml = (vnode: any) => {
      try {
        if (vnode.dom._lrRenderedHtml !== html) {
          vnode.dom.innerHTML = html;
          vnode.dom._lrRenderedHtml = html;
        }
      } catch (e) {
        console.error('[linkrobins/blog] body render failed:', e);
      }
    };
    return m('div', {
      className: 'LinkRobinsBlog-post-body',
      oncreate: setHtml,
      onupdate: setHtml,
    });
  }

  _renderMemberWall(attr: any) {
    // The API gives us pre-rendered teaserHtml (the first N characters of
    // the post, truncated on a word boundary), gated server-side by the
    // linkrobinsBlogMembersTeaserChars setting. Fall back to excerpt if for
    // any reason teaserHtml isn't available.
    let teaserHtml = '';
    if (typeof attr.teaserHtml === 'string' && attr.teaserHtml.trim() !== '') {
      teaserHtml = attr.teaserHtml;
    } else if (attr.excerpt && attr.excerpt.trim() !== '') {
      teaserHtml = `<p>${String(attr.excerpt).replace(/</g, '&lt;')}</p>`;
    }
    const loggedIn = app.session && app.session.user;
    return m('div', { className: 'LinkRobinsBlog-post-body LinkRobinsBlog-post-body--gated' }, [
      teaserHtml
        ? m('div', {
            className: 'LinkRobinsBlog-teaser',
            oncreate: (vnode: any) => {
              if (vnode.dom._lrRenderedHtml !== teaserHtml) {
                vnode.dom.innerHTML = teaserHtml;
                vnode.dom._lrRenderedHtml = teaserHtml;
              }
            },
            onupdate: (vnode: any) => {
              if (vnode.dom._lrRenderedHtml !== teaserHtml) {
                vnode.dom.innerHTML = teaserHtml;
                vnode.dom._lrRenderedHtml = teaserHtml;
              }
            },
          })
        : null,
      m('div', { className: 'LinkRobinsBlog-memberWall' }, [
        m('i', { className: 'fas fa-lock LinkRobinsBlog-memberWall-icon' }),
        m('h3', { className: 'LinkRobinsBlog-memberWall-title' }, tr('forum.post.members_only_heading')),
        m(
          'p',
          { className: 'LinkRobinsBlog-memberWall-text' },
          loggedIn ? tr('forum.post.members_only_text_member') : tr('forum.post.log_in_or_sign_up')
        ),
        loggedIn
          ? null
          : m(
              'button',
              {
                type: 'button',
                className: 'Button Button--primary LinkRobinsBlog-memberWall-button',
                onclick: openLogIn,
              },
              tr('forum.post.log_in_continue')
            ),
      ]),
    ]);
  }

  _renderCommentsSection(attr: any) {
    // Hide the section if the user can't even see the body (member wall is
    // showing instead).
    if (attr.canViewBody === false) return null;

    const commentsDisabled = attr.commentsEnabled === false;
    const discussion = this.discussion;
    const discussionId = attr.discussionId;

    // Comment count comes from attr.commentCount, computed live server-side
    // on every blog-post fetch — always current.
    const count = typeof attr.commentCount === 'number' ? attr.commentCount : 0;

    // Build the link into the full conversation. Prefer the loaded
    // discussion model's canonical route (/d/{id}-{slug}), fall back to
    // /d/{id} from the attribute — so the link still works even if the
    // discussion record fetch hasn't returned yet or quietly failed.
    let discussionHref: string | null = null;
    if (discussion) {
      try {
        discussionHref = app.route.discussion(discussion);
      } catch (e) {
        discussionHref = `/d/${discussion.id()}`;
      }
    } else if (discussionId) {
      discussionHref = `/d/${discussionId}`;
    }

    // No discussion at all (unpublished / comments disabled with no thread):
    // render nothing.
    if (!discussionHref && !this.commentsLoading) {
      return null;
    }

    const countLabel =
      count === 0
        ? tr('forum.post.comments_count_none')
        : count === 1
          ? tr('forum.post.comments_count_one')
          : tr('forum.post.comments_count_many', { count });

    const actionLabel = count === 0 ? tr('forum.post.comments_start') : tr('forum.post.comments_load_more');

    let body: any;
    if (commentsDisabled) {
      body = m('div', { className: 'LinkRobinsBlog-comments-disabledNote' }, [
        m('i', { className: 'fas fa-comment-slash' }),
        ` ${tr('forum.post.comments_locked')}`,
      ]);
    } else if (discussionHref) {
      body = m(
        'a',
        {
          href: discussionHref,
          className: 'LinkRobinsBlog-comments-link',
          onclick: (e: any) => safeNavigate(discussionHref, e),
        },
        [
          m('span', { className: 'LinkRobinsBlog-comments-linkCount' }, [m('i', { className: 'far fa-comments' }), ' ', countLabel]),
          m('span', { className: 'LinkRobinsBlog-comments-linkAction' }, actionLabel),
        ]
      );
    } else {
      body = m('div', { className: 'LinkRobinsBlog-comments-loading' }, tr('forum.index.loading'));
    }

    return m(
      'section',
      { className: `LinkRobinsBlog-comments${commentsDisabled ? ' LinkRobinsBlog-comments--disabled' : ''}` },
      body
    );
  }

  _renderRelatedPosts(attr: any) {
    // "You may also like" — 3 recommended posts from the same category (with
    // a most-recent fallback if there aren't enough). The list comes
    // pre-built from the API (BlogPostResource::relatedPosts), so this
    // method is purely presentational. Hidden if the API didn't return any
    // related posts, or if the viewer can't read the body (we don't want to
    // flash recommendations under a paywall).
    if (attr.canViewBody === false) return null;
    const related = attr.relatedPosts;
    if (!Array.isArray(related) || related.length === 0) return null;

    return m('section', { className: 'LinkRobinsBlog-related' }, [
      m('h3', { className: 'LinkRobinsBlog-related-heading' }, tr('forum.post.read_more_heading')),
      m(
        'div',
        { className: 'LinkRobinsBlog-related-grid' },
        related.map((rp: any) => {
          // The related-post payload is a flat object built server-side —
          // not a JSON:API resource — so we build the path manually rather
          // than going through postPath/datedSlugFor.
          let dated = rp.slug;
          if (rp.publishedAt) {
            try {
              const d = new Date(rp.publishedAt);
              if (!isNaN(d.getTime())) {
                const y = d.getUTCFullYear();
                const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
                const da = String(d.getUTCDate()).padStart(2, '0');
                dated = `${y}-${mo}-${da}-${rp.slug}`;
              }
            } catch (e) {
              // bad date — use the bare slug
            }
          }
          const path = `/${ARTICLE_SLUG}/${dated}`;
          const cat = rp.category || null;
          const cover = rp.coverImageUrl || null;
          const dateStr = rp.publishedAt ? formatDate(rp.publishedAt) : '';

          return m(
            'a',
            {
              href: path,
              className: 'LinkRobinsBlog-related-card',
              onclick: (e: any) => safeNavigate(path, e),
              key: `rp-${rp.id}`,
            },
            [
              m('div', { className: `LinkRobinsBlog-related-cover${cover ? ' has-cover' : ' no-cover'}` }, cover ? m('img', { src: cover, alt: '', loading: 'lazy' }) : null),
              m('div', { className: 'LinkRobinsBlog-related-body' }, [
                cat
                  ? m(
                      'span',
                      {
                        className: 'LinkRobinsBlog-related-tag',
                        style: cat.color ? `color: ${cat.color}` : null,
                      },
                      cat.name
                    )
                  : null,
                m('h4', { className: 'LinkRobinsBlog-related-title' }, rp.title),
                dateStr ? m('div', { className: 'LinkRobinsBlog-related-date' }, dateStr) : null,
              ]),
            ]
          );
        })
      ),
    ]);
  }
}
