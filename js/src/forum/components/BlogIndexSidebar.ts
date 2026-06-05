import app from 'flarum/forum/app';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';
import LinkButton from 'flarum/common/components/LinkButton';
import Button from 'flarum/common/components/Button';
import SelectDropdown from 'flarum/common/components/SelectDropdown';
import ItemList from 'flarum/common/utils/ItemList';

import {
  tr,
  basePath,
  blogIndexRoute,
  isBlogHomepage,
  isDraftsRoute,
  categoryPath,
  navLabel,
  navIcon,
  canCreateBlogPost,
  openLogIn,
  BLOG_SLUG,
} from '../utils';
import { getAllCategoriesCache } from '../api';
import { renderBlogBlocks } from '../blocks';
import { newsletterState, newsletterInitState, newsletterSubscribe, newsletterUnsubscribe } from '../newsletter';
import { openPostEditor } from '../editorNav';
import { invalidateCategoriesCache } from '../api';

export default class BlogIndexSidebar extends IndexSidebar {
  // The whole sidebar: a "Subscribe" primary button, the SelectDropdown nav,
  // then any registered blocks (About, Recent posts, etc.).
  items() {
    const items = new ItemList<any>();

    // Compose button. Visible only to users who can author blog posts (per
    // linkrobins-blog.start permission, plus admins). Sits beside Subscribe
    // with higher priority so it renders first.
    if (canCreateBlogPost()) {
      items.add(
        'compose',
        m(
          Button,
          {
            icon: 'fas fa-pen',
            className: 'Button Button--primary LinkRobinsBlog-composeButton',
            itemClassName: 'App-primaryControl',
            'aria-label': tr('forum.index.compose_button'),
            title: tr('forum.edit_post.title_create'),
            onclick: () => {
              openPostEditor(null);
              // Invalidate the category cache in case the user touches
              // categories during composition.
              invalidateCategoriesCache();
            },
          },
          tr('forum.index.compose_button')
        ),
        110
      );
    }

    // Newsletter subscribe button.
    newsletterInitState();
    const newsletter = newsletterState();
    const loggedIn = !!(app.session && app.session.user);
    const isSub = !!newsletter.subscribed;
    const busy = !!newsletter.busy;

    let icon: string;
    let label: any;
    let onclick: () => void;
    let extraClass: string;
    if (!loggedIn) {
      icon = 'far fa-star';
      label = tr('forum.subscribe.subscribe_button');
      extraClass = '';
      onclick = openLogIn;
    } else if (isSub) {
      icon = 'fas fa-star';
      label = busy ? tr('forum.subscribe.working_busy') : tr('forum.subscribe.subscribed_button');
      extraClass = ' is-subscribed';
      onclick = () => {
        if (newsletterState().busy) return;
        let ok = false;
        try {
          ok = window.confirm(tr('forum.subscribe.unsubscribe_confirm'));
        } catch (e) {
          ok = true;
        }
        if (ok) newsletterUnsubscribe();
      };
    } else {
      icon = 'far fa-star';
      label = busy ? tr('forum.subscribe.subscribing_busy') : tr('forum.subscribe.subscribe_button');
      extraClass = '';
      onclick = newsletterSubscribe;
    }

    items.add(
      'subscribe',
      m(
        Button,
        {
          icon,
          className: `Button LinkRobinsBlog-subscribeButton${extraClass}`,
          itemClassName: 'LinkRobinsBlog-subscribeButton-item',
          disabled: busy,
          'aria-label': label,
          title: label,
          onclick,
        },
        label
      ),
      100
    );

    items.add(
      'nav',
      m(
        SelectDropdown,
        {
          buttonClassName: 'Button',
          className: 'App-titleControl',
        },
        this.navItems().toArray()
      ),
      90
    );

    // Sidebar blocks rendered below the nav. Extensions register via
    // window.LinkRobinsBlogAddBlock(id, factory, priority).
    const blocksNode = renderBlogBlocks({ isPostPage: !!(this.attrs && (this.attrs as any).isPostPage) }, 'LinkRobinsBlog-blocks--sidebar');
    if (blocksNode) {
      items.add('blocks', blocksNode, 50);
    }

    return items;
  }

  navItems() {
    // Start from the parent IndexSidebar's nav items list, which gives us
    // "All Discussions" plus whatever other extensions contribute via
    // extend(IndexSidebar.prototype, 'navItems').
    //
    // We then layer the blog's own items on top:
    //   - "All Posts" at the top
    //   - "Drafts" for authoring users
    //   - "Categories" section at the bottom
    //
    // Two cleanups happen here:
    //   1. flarum/tags adds a "Tags" link AND a long per-tag link list. We
    //      keep the "Tags" link (lets readers jump to /tags), but we set
    //      noTagsList=true in the pages' oninit so the tags extension skips
    //      the per-tag list. We also strip its orphan separator if it
    //      slipped through.
    //   2. Nothing else needs stripping here — the redundant forum-side
    //      "Blog" link is suppressed at its source (the extend() wrapper in
    //      the initializer opts out on blog pages).
    let items: ItemList<any>;
    try {
      items = super.navItems();
    } catch (e) {
      console.warn('[linkrobins/blog] super.navItems() threw, falling back to empty:', e);
      items = new ItemList<any>();
    }
    if (!items) return items;

    // Defense in depth: if noTagsList didn't take effect for some reason,
    // still strip the orphan separator the tags extension would emit just
    // before its (now-absent) tag list.
    try {
      if (items.has('separator')) {
        items.remove('separator');
      }
    } catch (e) {
      // ItemList shape changed — separator stays, harmless
    }

    const bp = basePath();
    const blogHome = isBlogHomepage();
    const allHref = blogHome ? `${bp}/` : bp + blogIndexRoute();
    const activeSlug = (this.attrs && (this.attrs as any).activeCategorySlug) || null;
    const isPostView = !!(this.attrs && (this.attrs as any).isPostPage);
    const onDrafts = isDraftsRoute();
    const allActive = !activeSlug && !isPostView && !onDrafts;

    // Homepage entry goes first on every page (matches the ordering in the
    // forum-side IndexSidebar). When blog is the homepage, "All Posts" is at
    // 100 and we push the inherited "All Discussions" down to 90. When
    // all-discussions is the homepage, "All Posts" is at 90 and the
    // inherited "All Discussions" stays at its default 100.
    const allPostsPriority = blogHome ? 100 : 90;
    items.add(
      'allPosts',
      m(
        LinkButton,
        {
          href: allHref,
          icon: navIcon(),
          active: allActive,
        },
        navLabel() || tr('forum.sidebar.all_posts')
      ),
      allPostsPriority
    );
    if (blogHome) {
      try {
        if (items.has('allDiscussions')) {
          items.setPriority('allDiscussions', 90);
        }
      } catch (e) {
        // ItemList shape changed — priority stays default
      }
    }

    const cats = getAllCategoriesCache() || [];
    const showDrafts = canCreateBlogPost();

    if (showDrafts || cats.length) {
      items.add(
        'categoriesHeading',
        m('h4', { className: 'LinkRobinsBlog-sidebar-sectionHeading' }, tr('forum.sidebar.categories_heading')),
        -60
      );
    }

    // Drafts sits as the first entry under the Categories heading, styled
    // like a category so it blends visually with the rest. It keeps the
    // eye-slash icon (drafts = not visible) but uses the same category-link
    // class as the real categories, including the colored-icon accent via
    // --blog-cat-color (we pick a muted gray so it reads as "system" rather
    // than borrowing a real category's brand color).
    if (showDrafts) {
      items.add(
        'drafts',
        m(
          LinkButton,
          {
            href: `${bp}/${BLOG_SLUG}/drafts`,
            icon: 'fas fa-file-alt',
            active: isDraftsRoute(),
            className: 'LinkRobinsBlog-sidebar-categoryLink LinkRobinsBlog-sidebar-draftsLink',
            style: '--blog-cat-color: var(--muted-color)',
            title: tr('forum.sidebar.drafts_tooltip'),
          },
          tr('forum.sidebar.drafts')
        ),
        -61
      );
    }

    cats.forEach((cat: any, i: number) => {
      const attr = cat.attributes || {};
      const slug = attr.slug || cat.id;
      const color = attr.color || null;

      items.add(
        `category-${slug}`,
        m(
          LinkButton,
          {
            href: bp + categoryPath(cat),
            icon: attr.icon || 'fas fa-folder',
            active: activeSlug === slug,
            className: 'LinkRobinsBlog-sidebar-categoryLink',
            style: color ? `--blog-cat-color: ${color}` : '',
            title: attr.description || attr.name,
          },
          attr.name
        ),
        -62 - i
      );
    });

    return items;
  }
}
