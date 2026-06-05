import app from 'flarum/forum/app';
import { extend } from 'flarum/common/extend';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';
import LinkButton from 'flarum/common/components/LinkButton';
import type ItemList from 'flarum/common/utils/ItemList';

import { basePath, blogIndexRoute, isBlogHomepage, navLabel, navIcon, BLOG_SLUG, ARTICLE_SLUG } from './forum/utils';
import BlogIndexPage from './forum/components/BlogIndexPage';
import BlogPostPage from './forum/components/BlogPostPage';
import BlogPostEditorPage from './forum/components/BlogPostEditorPage';
import './forum/blocks';

app.initializers.add('linkrobins-blog', () => {
  app.routes['linkrobins-blog.index'] = { path: `/${BLOG_SLUG}`, component: BlogIndexPage };
  app.routes['linkrobins-blog.category'] = { path: '/category/:slug', component: BlogIndexPage };
  // The drafts route shares BlogIndexPage; the page sniffs the current
  // Mithril route to know when it's the drafts view.
  app.routes['linkrobins-blog.drafts'] = { path: `/${BLOG_SLUG}/drafts`, component: BlogIndexPage };
  // Post authoring/editing pages. `/blog/compose` (new) must be registered
  // before `/blog/:slug`-style routes; it and the edit route share the
  // editor page.
  app.routes['linkrobins-blog.compose'] = { path: `/${BLOG_SLUG}/compose`, component: BlogPostEditorPage };
  app.routes['linkrobins-blog.edit'] = { path: `/${BLOG_SLUG}/compose/:id`, component: BlogPostEditorPage };
  app.routes['linkrobins-blog.post'] = { path: `/${ARTICLE_SLUG}/:slug`, component: BlogPostPage };

  // Note: blog-comment discussions are ordinary, visible Flarum discussions
  // (just kept out of /all listings server-side). The blog article page
  // links out to the discussion at /d/{id} rather than mounting a PostStream
  // inline, so none of the old composer / route patching is needed.

  extend(IndexSidebar.prototype, 'navItems', function (items: ItemList<any>) {
    // Skip when the current page is itself a blog page. The BlogIndexSidebar
    // subclass calls super.navItems(), which routes through this wrapper —
    // adding our own "Blog" link there would duplicate the
    // BlogIndexSidebar's own "All Posts" link. The wrapper is only useful
    // from the *forum* IndexSidebar (e.g. when reading /all), where it gives
    // users a shortcut over to the blog.
    try {
      const routeName = app.current && typeof app.current.get === 'function' ? app.current.get('routeName') : null;
      if (typeof routeName === 'string' && routeName.indexOf('linkrobins-blog') === 0) {
        return;
      }
    } catch (e) {
      // PageState unavailable — fall through and add the link
    }

    // Whichever entry is the configured homepage takes the top slot in the
    // SelectDropdown, on EVERY page. So:
    //   - blog homepage: Blog at 100, demote allDiscussions to 90
    //   - all-discussions homepage: Blog at 90, leave allDiscussions at 100
    // This produces a stable nav: the user's chosen "home" is always first
    // regardless of what they're currently viewing, matching how Flarum's
    // defaultRoute is meant to be the primary destination.
    const bp = basePath();
    const blogHome = isBlogHomepage();
    const href = blogHome ? `${bp}/` : bp + blogIndexRoute();

    if (blogHome) {
      items.add('linkrobins-blog', m(LinkButton, { href, icon: navIcon() }, navLabel()), 100);
      // Push the core allDiscussions entry down a notch so the homepage
      // (Blog) reads first. setPriority is a no-op if the key isn't present,
      // but we guard anyway for old/future ItemList shapes.
      try {
        if (items.has('allDiscussions')) {
          items.setPriority('allDiscussions', 90);
        }
      } catch (e) {
        // ItemList shape changed — priority stays default
      }
    } else {
      items.add('linkrobins-blog', m(LinkButton, { href, icon: navIcon() }, navLabel()), 90);
    }
  });
});
