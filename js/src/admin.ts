import app from 'flarum/admin/app';
import { extend } from 'flarum/common/extend';
import BasicsPage from 'flarum/admin/components/BasicsPage';

import { t } from './admin/utils';
import BlogAdminPage from './admin/components/BlogAdminPage';
import CategoryEditorModal from './admin/components/CategoryEditorModal';

app.initializers.add('linkrobins-blog', () => {
  app.registry.for('linkrobins-blog').registerPage(BlogAdminPage);

  // Kept for any external callers that used the old global to open the
  // category editor.
  (window as any).LinkRobinsBlogCategoryEditorModal = CategoryEditorModal;

  // Add Blog as a homepage option in admin → Basics → Home page.
  // homePageItems is a static method on BasicsPage, so we extend the class
  // itself rather than its prototype.
  extend(BasicsPage, 'homePageItems', (items: any) => {
    items.add(
      'linkrobins-blog',
      {
        path: '/blog',
        label: t('admin.permissions.group_heading'),
      },
      90
    );
  });

  // Register the two blog permissions so they appear on the admin
  // Permissions page. The .start permission grants authoring rights;
  // .moderate grants editing/deleting others' posts.
  app.registry.registerPermission(
    {
      permission: 'linkrobins-blog.start',
      icon: 'fas fa-feather-alt',
      label: t('admin.permissions.start_label'),
    },
    'start',
    95
  );
  app.registry.registerPermission(
    {
      permission: 'linkrobins-blog.moderate',
      icon: 'fas fa-feather-alt',
      label: t('admin.permissions.moderate_label'),
    },
    'moderate',
    95
  );
});
