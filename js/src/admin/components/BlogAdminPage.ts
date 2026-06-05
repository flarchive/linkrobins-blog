import app from 'flarum/admin/app';
import ExtensionPage from 'flarum/admin/components/ExtensionPage';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';

import { t, isFofUploadInstalled, uploadFofFile } from '../utils';
import { fetchCategoriesList, deleteBlogCategory } from '../api';
import CategoryEditorModal from './CategoryEditorModal';

export default class BlogAdminPage extends ExtensionPage {
  tab = 'categories';
  loading = true;
  categories: any[] = [];
  error: any = null;

  private _subscriberCount: number | undefined = undefined;
  private _subscriberLoading = false;
  private _subscriberError: any = null;
  private _heroBgUploading = false;
  private _heroBgError: any = null;
  private _heroBgFileInput: HTMLInputElement | null = null;

  oninit(vnode: any) {
    super.oninit(vnode);
    this._loadData();
  }

  _loadData() {
    this.loading = true;
    m.redraw();

    fetchCategoriesList()
      .then((categoriesResp: any) => {
        this.categories = (categoriesResp && categoriesResp.data) || [];
        this.loading = false;
        m.redraw();
      })
      .catch((err: any) => {
        this.error = err;
        this.loading = false;
        console.error('[linkrobins/blog] admin load failed:', err);
        m.redraw();
      });
  }

  content() {
    return m('div', { className: 'container LinkRobinsBlog-admin' }, [this._renderTabs(), this._renderTabContent()]);
  }

  _renderTabs() {
    const tabs = [
      { id: 'categories', label: t('admin.tabs.categories'), icon: 'fas fa-folder' },
      { id: 'subscribers', label: t('admin.tabs.subscribers'), icon: 'fas fa-envelope' },
      { id: 'settings', label: t('admin.tabs.settings'), icon: 'fas fa-sliders-h' },
    ];
    return m(
      'div',
      { className: 'LinkRobinsBlog-admin-tabs' },
      tabs.map((tab) =>
        m(
          'button',
          {
            type: 'button',
            className: `LinkRobinsBlog-admin-tab${this.tab === tab.id ? ' is-active' : ''}`,
            onclick: () => {
              this.tab = tab.id;
            },
          },
          [m('i', { className: tab.icon }), ' ', tab.label]
        )
      )
    );
  }

  _renderTabContent() {
    if (this.tab === 'categories') return this._renderCategoriesTab();
    if (this.tab === 'subscribers') return this._renderSubscribersTab();
    if (this.tab === 'settings') return this._renderSettingsTab();
    return m('div', { className: 'LinkRobinsBlog-admin-empty' }, t('admin.categories.loading'));
  }

  _renderCategoriesTab() {
    if (this.loading) {
      return m(
        'div',
        { className: 'LinkRobinsBlog-admin-loading' },
        LoadingIndicator ? m(LoadingIndicator) : t('admin.categories.loading')
      );
    }
    if (this.error) {
      return m('div', { className: 'LinkRobinsBlog-admin-empty' }, t('admin.categories.load_failed'));
    }

    return m('div', { className: 'LinkRobinsBlog-admin-categories' }, [
      m('div', { className: 'LinkRobinsBlog-admin-postsHeader' }, [
        m('h3', null, t('admin.categories.heading', { count: this.categories.length })),
        m(
          'button',
          {
            type: 'button',
            className: 'Button Button--primary',
            onclick: () => this._openCategoryEditor(null),
          },
          [m('i', { className: 'fas fa-plus' }), ' ', t('admin.categories.new_button')]
        ),
      ]),

      this.categories.length === 0
        ? m('div', { className: 'LinkRobinsBlog-admin-empty' }, t('admin.categories.empty'))
        : this._renderCategoriesTable(),
    ]);
  }

  _renderCategoriesTable() {
    const sorted = this.categories.slice().sort((a, b) => {
      const ap = (a.attributes && a.attributes.position) || 0;
      const bp = (b.attributes && b.attributes.position) || 0;
      if (ap !== bp) return ap - bp;
      return String(a.attributes.name || '').localeCompare(String(b.attributes.name || ''));
    });

    return m('table', { className: 'LinkRobinsBlog-admin-postsTable LinkRobinsBlog-admin-categoriesTable' }, [
      m(
        'thead',
        null,
        m('tr', null, [
          m('th', null, t('admin.categories.col_position')),
          m('th', null, t('admin.categories.col_name')),
          m('th', null, t('admin.categories.col_slug')),
          m('th', null, t('admin.categories.col_posts')),
          m('th', { className: 'LinkRobinsBlog-admin-actionsCol' }, ''),
        ])
      ),
      m('tbody', null, sorted.map((cat) => this._renderCategoryRow(cat))),
    ]);
  }

  _renderCategoryRow(cat: any) {
    const attr = cat.attributes || {};
    const color = attr.color || null;
    const icon = attr.icon || 'fas fa-folder';

    return m('tr', { key: `cat-${cat.id}` }, [
      m('td', { className: 'LinkRobinsBlog-admin-categoryPosCell' }, attr.position || 0),
      m(
        'td',
        null,
        m('span', { className: 'LinkRobinsBlog-admin-categoryNameCell' }, [
          m(
            'span',
            {
              className: 'LinkRobinsBlog-admin-categorySwatch',
              style: color ? `background: ${color}` : 'background: rgba(127,127,127,0.2)',
              'aria-hidden': 'true',
            },
            m('i', { className: `${icon} LinkRobinsBlog-admin-categorySwatch-icon` })
          ),
          m('span', { className: 'LinkRobinsBlog-admin-categoryName' }, attr.name),
          attr.description ? m('span', { className: 'LinkRobinsBlog-admin-categoryDesc' }, attr.description) : null,
        ])
      ),
      m('td', { className: 'LinkRobinsBlog-admin-categorySlugCell' }, m('code', null, attr.slug)),
      m('td', null, typeof attr.postCount === 'number' ? attr.postCount : '—'),
      m('td', { className: 'LinkRobinsBlog-admin-actionsCol' }, [
        m(
          'button',
          {
            type: 'button',
            className: 'Button Button--icon Button--link',
            title: t('admin.categories.action_edit'),
            onclick: () => this._openCategoryEditor(cat),
          },
          m('i', { className: 'fas fa-pen' })
        ),
        m(
          'button',
          {
            type: 'button',
            className: 'Button Button--icon Button--link',
            title: t('admin.categories.action_delete'),
            onclick: () => this._deleteCategory(cat),
          },
          m('i', { className: 'fas fa-trash' })
        ),
      ]),
    ]);
  }

  _openCategoryEditor(cat: any) {
    if (!app.modal) return;
    app.modal.show(CategoryEditorModal, {
      category: cat,
      onSaved: () => this._loadData(),
    });
  }

  _deleteCategory(cat: any) {
    const attr = cat.attributes || {};
    const name = attr.name || t('admin.categories.fallback_name', { id: cat.id });
    const count = typeof attr.postCount === 'number' ? attr.postCount : null;
    let warn: any;
    if (count && count > 0) {
      const key = count === 1 ? 'admin.categories.delete_confirm_with_posts_one' : 'admin.categories.delete_confirm_with_posts_many';
      warn = t(key, { name, count });
    } else {
      warn = t('admin.categories.delete_confirm', { name });
    }
    if (!window.confirm(warn)) return;

    deleteBlogCategory(cat.id)
      .then(() => this._loadData())
      .catch((err: any) => {
        console.error('[linkrobins/blog] delete category failed:', err);
        try {
          alert(t('admin.categories.delete_failed'));
        } catch (e) {
          // alerts can be blocked
        }
      });
  }

  _renderSubscribersTab() {
    if (this._subscriberCount === undefined && !this._subscriberLoading) {
      this._loadSubscriberCount();
    }

    const csvUrl = `${app.forum.attribute('apiUrl')}/linkrobins-blog/subscribers?format=csv`;

    return m('section', { className: 'LinkRobinsBlog-admin-subscribers' }, [
      m('div', { className: 'LinkRobinsBlog-admin-subscribers-header' }, [
        m('h2', null, t('admin.subscribers.heading')),
        m('p', { className: 'LinkRobinsBlog-admin-subscribers-blurb' }, t('admin.subscribers.blurb')),
      ]),

      m('div', { className: 'LinkRobinsBlog-admin-subscribers-stats' }, [
        m('div', { className: 'LinkRobinsBlog-admin-subscribers-stat' }, [
          m('div', { className: 'LinkRobinsBlog-admin-subscribers-statLabel' }, t('admin.subscribers.count_label')),
          m(
            'div',
            { className: 'LinkRobinsBlog-admin-subscribers-statValue' },
            this._subscriberLoading
              ? '…'
              : typeof this._subscriberCount === 'number'
                ? this._subscriberCount.toLocaleString()
                : '—'
          ),
        ]),
      ]),

      this._subscriberError ? m('div', { className: 'Alert Alert--danger' }, this._subscriberError) : null,

      m('div', { className: 'LinkRobinsBlog-admin-subscribers-actions' }, [
        m(
          'button',
          {
            type: 'button',
            className: 'Button',
            disabled: this._subscriberLoading,
            onclick: () => this._loadSubscriberCount(),
          },
          [m('i', { className: 'fas fa-sync' }), ' ', t('admin.categories.refresh_button')]
        ),
        m('a', { href: csvUrl, className: 'Button Button--primary' }, [
          m('i', { className: 'fas fa-download' }),
          ' ',
          t('admin.subscribers.download_csv'),
        ]),
      ]),
    ]);
  }

  _loadSubscriberCount() {
    this._subscriberLoading = true;
    this._subscriberError = null;
    m.redraw();
    app
      .request({
        method: 'GET',
        url: `${app.forum.attribute('apiUrl')}/linkrobins-blog/subscribers`,
      })
      .then((resp: any) => {
        this._subscriberLoading = false;
        this._subscriberCount = resp && typeof resp.count === 'number' ? resp.count : 0;
        m.redraw();
      })
      .catch((err: any) => {
        console.error('[linkrobins/blog] subscriber count failed:', err);
        this._subscriberLoading = false;
        this._subscriberError = t('admin.subscribers.load_failed');
        m.redraw();
      });
  }

  _renderSettingsTab() {
    const headerModeOptions = {
      text: t('admin.settings.header_mode_text'),
      logo: t('admin.settings.header_mode_logo'),
      none: t('admin.settings.header_mode_none'),
    };

    const heroModeOptions = {
      none: t('admin.settings.hero_bg_none'),
      image: t('admin.settings.hero_bg_image'),
      gradient: t('admin.settings.hero_bg_gradient'),
    };

    const page = this;

    const fields: Array<{ section: any; items: any[] }> = [
      {
        section: t('admin.settings.section_brand'),
        items: [
          {
            setting: 'linkrobins-blog.title',
            type: 'text',
            label: t('admin.settings.title_label'),
            help: t('admin.settings.title_help'),
            placeholder: app.forum.attribute('title') || t('admin.settings.title_placeholder_fallback'),
          },
          {
            setting: 'linkrobins-blog.tagline',
            type: 'text',
            label: t('admin.settings.tagline_label'),
            help: t('admin.settings.tagline_help'),
            placeholder: t('admin.settings.tagline_placeholder'),
          },
        ],
      },

      {
        section: t('admin.settings.section_hero'),
        items: [
          {
            setting: 'linkrobins-blog.header_mode',
            type: 'select',
            label: t('admin.settings.header_mode_label'),
            help: t('admin.settings.header_mode_help'),
            options: headerModeOptions,
            default: 'text',
          },
          {
            setting: 'linkrobins-blog.hero_background_mode',
            type: 'select',
            label: t('admin.settings.hero_bg_label'),
            help: t('admin.settings.hero_bg_help'),
            options: heroModeOptions,
            default: 'none',
          },
          function (this: any) {
            // Custom renderer for hero background image URL with optional
            // fof/upload picker.
            const key = 'linkrobins-blog.hero_background_url';
            const current = page.setting(key)() || '';
            const hasFofUpload = isFofUploadInstalled();

            return m('div', { className: 'Form-group LinkRobinsBlog-settings-heroBgGroup' }, [
              m('label', null, t('admin.settings.hero_bg_image_label')),
              m('div', { className: 'LinkRobinsBlog-settings-heroBgInputRow' }, [
                m('input', {
                  type: 'url',
                  className: 'FormControl',
                  value: current,
                  placeholder: t('admin.settings.hero_bg_image_placeholder'),
                  disabled: page._heroBgUploading,
                  oninput: (e: any) => {
                    page.setting(key)(e.target.value);
                  },
                }),
                hasFofUpload
                  ? m(
                      'button',
                      {
                        type: 'button',
                        className: 'Button LinkRobinsBlog-settings-heroBgUploadBtn',
                        disabled: page._heroBgUploading,
                        onclick: () => {
                          if (page._heroBgFileInput) page._heroBgFileInput.click();
                        },
                      },
                      [
                        page._heroBgUploading ? m('i', { className: 'fas fa-spinner fa-spin' }) : m('i', { className: 'fas fa-upload' }),
                        ' ',
                        page._heroBgUploading ? t('admin.settings.hero_bg_uploading') : t('admin.settings.hero_bg_upload_button'),
                      ]
                    )
                  : null,
                hasFofUpload
                  ? m('input', {
                      type: 'file',
                      accept: 'image/*',
                      style: 'display: none;',
                      oncreate: (vnode: any) => {
                        page._heroBgFileInput = vnode.dom;
                      },
                      onchange: (e: any) => {
                        const f = e.target && e.target.files && e.target.files[0];
                        if (!f) return;
                        uploadFofFile(f, (url, err) => {
                          page._heroBgUploading = false;
                          if (url) {
                            page.setting(key)(url);
                            page._heroBgError = null;
                          } else {
                            page._heroBgError = err || t('admin.settings.upload_failed');
                          }
                          m.redraw();
                        });
                        page._heroBgUploading = true;
                        page._heroBgError = null;
                        m.redraw();
                        e.target.value = '';
                      },
                    })
                  : null,
              ]),
              m(
                'div',
                { className: 'helpText' },
                hasFofUpload ? t('admin.settings.hero_bg_image_help_with_upload') : t('admin.settings.hero_bg_image_help_no_upload')
              ),
              page._heroBgError
                ? m(
                    'div',
                    { className: 'Alert Alert--danger', style: 'margin-top:8px' },
                    m('span', { className: 'Alert-body' }, page._heroBgError)
                  )
                : null,
              current
                ? m(
                    'div',
                    { className: 'LinkRobinsBlog-settings-heroBgPreview' },
                    m('img', {
                      src: current,
                      alt: '',
                      onerror: (e: any) => {
                        e.target.style.display = 'none';
                      },
                    })
                  )
                : null,
            ]);
          },
          {
            setting: 'linkrobins-blog.hero_overlay',
            type: 'number',
            label: t('admin.settings.hero_overlay_label'),
            help: t('admin.settings.hero_overlay_help'),
            min: 0,
            max: 90,
            default: '40',
          },
        ],
      },

      {
        section: t('admin.settings.section_nav'),
        items: [
          {
            setting: 'linkrobins-blog.nav_label',
            type: 'text',
            label: t('admin.settings.nav_label_label'),
            help: t('admin.settings.nav_label_help'),
            placeholder: t('admin.settings.nav_label_placeholder'),
          },
          {
            setting: 'linkrobins-blog.nav_icon',
            type: 'text',
            label: t('admin.settings.nav_icon_label'),
            help: t('admin.settings.nav_icon_help'),
            placeholder: t('admin.settings.nav_icon_placeholder'),
          },
        ],
      },

      {
        section: t('admin.settings.section_layout'),
        items: [
          {
            setting: 'linkrobins-blog.posts_per_page',
            type: 'number',
            label: t('admin.settings.posts_per_page_label'),
            help: t('admin.settings.posts_per_page_help'),
            min: 1,
            max: 50,
            default: '12',
          },
          {
            setting: 'linkrobins-blog.members_teaser_chars',
            type: 'number',
            label: t('admin.settings.members_teaser_label'),
            help: t('admin.settings.members_teaser_help'),
            min: 50,
            max: 5000,
            default: '500',
          },
        ],
      },

      {
        section: t('admin.settings.section_about'),
        items: [
          {
            setting: 'linkrobins-blog.about_title',
            type: 'text',
            label: t('admin.settings.about_title_label'),
            help: t('admin.settings.about_title_help'),
            placeholder: t('admin.settings.about_title_placeholder'),
          },
          {
            setting: 'linkrobins-blog.about_html',
            type: 'textarea',
            label: t('admin.settings.about_html_label'),
            help: t('admin.settings.about_html_help'),
            rows: 5,
          },
        ],
      },
    ];

    const sections = fields.map((group) =>
      m('fieldset', { className: 'Form-group LinkRobinsBlog-settings-section' }, [
        m('legend', null, group.section),
        group.items.map((it) => {
          try {
            return this.buildSettingComponent(it);
          } catch (e) {
            console.error('[linkrobins/blog] setting failed:', it, e);
            return null;
          }
        }),
      ])
    );

    const changed = this.isChanged && this.isChanged();

    return m(
      'form',
      {
        className: 'Form LinkRobinsBlog-settings',
        onsubmit: (e: any) => {
          e.preventDefault();
          if (!this.saveSettings) return;
          this.saveSettings(e).then(() => {
            try {
              m.redraw();
            } catch (err) {
              // unmounted
            }
          });
        },
      },
      [
        m('div', { className: 'Form-body' }, sections),
        m('div', { className: 'Form-group Form-controls LinkRobinsBlog-settings-actions' }, [
          m(
            'button',
            {
              type: 'submit',
              className: `Button Button--primary${!changed ? ' disabled' : ''}${this.loading ? ' loading' : ''}`,
              disabled: !changed || this.loading,
            },
            this.loading ? t('admin.settings.saving') : t('admin.settings.save_button')
          ),
        ]),
      ]
    );
  }
}
