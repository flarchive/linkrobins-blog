import app from 'flarum/forum/app';
import Page from 'flarum/common/components/Page';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import PageStructure from 'flarum/forum/components/PageStructure';

import { tr, blogIndexRoute, slugify, insertAtCursor, postPath, BLOG_SLUG } from '../utils';
import { fetchPost, createBlogPost, updateBlogPost, deleteBlogPost, loadCategoriesForEditor, invalidateCategoriesCache } from '../api';
import {
  getTextEditor,
  isFofUploadInstalled,
  blogComposerSupported,
  blogComposerPreview,
  blogComposerOpenFor,
  blogComposerContent,
  openBlogComposer,
} from '../composer';
import { broadcastBlogRefresh } from '../refresh';
import { consumePendingEditorPost } from '../editorNav';
import BlogIndexSidebar from './BlogIndexSidebar';

export default class BlogPostEditorPage extends Page {
  editId: any = null;
  loading = true;
  saving = false;
  error: any = null;
  categories: any[] = [];
  // Field state (defaults for a new post).
  titleText = '';
  slug = '';
  excerpt = '';
  cover = '';
  coverCredit = '';
  coverCreditUrl = '';
  bodyText = '';
  visibility = 'public';
  categoryId: any = '';
  isPublished = false;
  commentsEnabled = true;
  coverUploading = false;
  coverUploadError: any = null;
  bodyUploading = false;
  bodyUploadIndex = 0;
  bodyUploadTotal = 0;
  bodyUploadError: any = null;

  private _coverFileInput: HTMLInputElement | null = null;
  private _bodyFileInput: HTMLInputElement | null = null;
  private _bodyComposer: any = null;

  oninit(vnode: any) {
    super.oninit(vnode);

    if (!app.session || !app.session.user) {
      m.route.set(blogIndexRoute());
      return;
    }

    const routeId = (m.route.param && m.route.param('id')) || null;
    this.editId = routeId || null;
    try {
      app.setTitle(routeId ? tr('forum.edit_post.title_edit') : tr('forum.edit_post.title_create'));
    } catch (e) {
      // title API unavailable
    }

    // Load categories first, then populate from the stashed/fetched post
    // (edit) or leave defaults (new).
    loadCategoriesForEditor((categories) => {
      this.categories = categories || [];
      if (routeId) {
        const stashed = consumePendingEditorPost(routeId);
        if (stashed) {
          this._populateFromPost(stashed);
          this.loading = false;
          m.redraw();
        } else {
          // Direct navigation / refresh: fetch the post by id.
          fetchPost(routeId)
            .then((resp: any) => {
              if (resp && resp.data) this._populateFromPost(resp.data);
              this.loading = false;
              m.redraw();
            })
            .catch((err: any) => {
              this.error = err;
              this.loading = false;
              m.redraw();
            });
        }
      } else {
        this.loading = false;
        m.redraw();
      }
    });
  }

  _populateFromPost(post: any) {
    const attr = (post && post.attributes) || {};
    const cat = post ? post.relationships && post.relationships.category && post.relationships.category.data : null;
    this.editId = post ? post.id : this.editId;
    this.titleText = attr.title || '';
    this.slug = attr.slug || '';
    this.excerpt = attr.excerpt || '';
    this.cover = attr.coverImageUrl || '';
    this.coverCredit = attr.coverImageCredit || '';
    this.coverCreditUrl = attr.coverImageCreditUrl || '';
    this.bodyText = attr.content || '';
    this.visibility = attr.visibility || 'public';
    this.categoryId = cat ? cat.id : '';
    this.isPublished = attr.isPublished === true;
    this.commentsEnabled = attr.commentsEnabled !== false;
  }

  _wrap(inner: any) {
    if (PageStructure) {
      return m(
        PageStructure,
        {
          className: 'IndexPage LinkRobinsBlog-page',
          sidebar: () => m(BlogIndexSidebar, { className: 'LinkRobinsBlog-sidebar' }),
        },
        inner
      );
    }
    return m('div', { className: 'IndexPage LinkRobinsBlog-page' }, inner);
  }

  view() {
    if (this.loading) {
      return this._wrap(
        m(
          'div',
          { className: 'LinkRobinsBlog-editor LinkRobinsBlog-editor--page' },
          LoadingIndicator ? m(LoadingIndicator) : tr('forum.index.loading')
        )
      );
    }

    return this._wrap(
      m('div', { className: 'LinkRobinsBlog-editor LinkRobinsBlog-editor--page' }, [
        m(
          'h1',
          { className: 'LinkRobinsBlog-editor-pageTitle' },
          this.editId ? tr('forum.edit_post.title_edit') : tr('forum.edit_post.title_create')
        ),
        this.error
          ? m('div', { className: 'Alert Alert--danger' }, [
              m('span', { className: 'Alert-body' }, tr('forum.edit_post.save_failed', { detail: this._errorMessage() })),
            ])
          : null,
        m('div', { className: 'Form-body' }, [
          this._renderTitleAndSlug(),
          this._renderExcerpt(),
          this._renderCover(),
          this._renderMeta(),
          m('div', { className: 'LinkRobinsBlog-editor-bodyWrapper' }, [this._renderToolbar(), this._renderBody()]),
        ]),
        this._renderActions(),
      ])
    );
  }

  _errorMessage() {
    const err = this.error;
    if (!err) return tr('forum.edit_post.unknown_error');
    if (err._local) return err._local;
    try {
      const errors = err.response && err.response.errors;
      if (errors && errors[0]) {
        const src = errors[0].source && (errors[0].source.pointer || errors[0].source.parameter);
        return (errors[0].detail || errors[0].title || tr('forum.edit_post.error_label')) + (src ? ` (${src})` : '');
      }
    } catch (e) {
      // malformed error response
    }
    return err.message || err.statusText || tr('forum.edit_post.unknown_error');
  }

  _renderTitleAndSlug() {
    return m('div', { className: 'Form-group' }, [
      m('label', null, tr('forum.edit_post.title_label')),
      m('input', {
        type: 'text',
        className: 'FormControl',
        value: this.titleText,
        disabled: this.saving,
        placeholder: tr('forum.edit_post.title_placeholder'),
        oninput: (e: any) => {
          this.titleText = e.target.value;
          if (!this.editId) {
            this.slug = slugify(this.titleText);
          }
        },
      }),
    ]);
  }

  _renderExcerpt() {
    return m('div', { className: 'Form-group' }, [
      m(
        'label',
        null,
        `${tr('forum.edit_post.excerpt_label')} `,
        m('span', { className: 'LinkRobinsBlog-editor-optional' }, tr('forum.edit_post.excerpt_optional'))
      ),
      m('textarea', {
        className: 'FormControl',
        value: this.excerpt,
        disabled: this.saving,
        rows: 2,
        placeholder: tr('forum.edit_post.excerpt_placeholder'),
        oninput: (e: any) => {
          this.excerpt = e.target.value;
        },
      }),
    ]);
  }

  _renderCover() {
    const hasFofUpload = isFofUploadInstalled();
    return m('div', { className: 'Form-group LinkRobinsBlog-editor-coverGroup' }, [
      m('label', null, tr('forum.edit_post.cover_label')),
      m('div', { className: 'LinkRobinsBlog-editor-coverInputRow' }, [
        m('input', {
          type: 'text',
          className: 'FormControl',
          value: this.cover,
          disabled: this.saving || this.coverUploading,
          placeholder: tr('forum.edit_post.cover_url_placeholder'),
          oninput: (e: any) => {
            this.cover = e.target.value;
          },
        }),
        hasFofUpload
          ? m(
              'button',
              {
                type: 'button',
                className: 'Button LinkRobinsBlog-editor-coverUploadBtn',
                disabled: this.saving || this.coverUploading,
                onclick: () => this._pickCoverFile(),
              },
              [
                this.coverUploading
                  ? m('i', { className: 'fas fa-spinner fa-spin LinkRobinsBlog-editor-coverUploadIcon' })
                  : m('i', { className: 'fas fa-upload LinkRobinsBlog-editor-coverUploadIcon' }),
                ' ',
                this.coverUploading ? tr('forum.edit_post.cover_uploading') : tr('forum.edit_post.cover_upload_button'),
              ]
            )
          : null,
        // Hidden file input the Upload button triggers.
        hasFofUpload
          ? m('input', {
              type: 'file',
              accept: 'image/*',
              style: 'display: none;',
              oncreate: (vnode: any) => {
                this._coverFileInput = vnode.dom;
              },
              onchange: (e: any) => {
                const f = e.target && e.target.files && e.target.files[0];
                if (f) this._uploadCover(f);
                if (e.target) e.target.value = '';
              },
            })
          : null,
      ]),
      !hasFofUpload ? m('div', { className: 'helpText' }, tr('forum.edit_post.cover_url_help')) : null,
      this.coverUploadError
        ? m(
            'div',
            { className: 'Alert Alert--danger', style: 'margin-top:8px' },
            m('span', { className: 'Alert-body' }, this.coverUploadError)
          )
        : null,
      this.cover
        ? m(
            'div',
            { className: 'LinkRobinsBlog-editor-coverPreview' },
            m('img', {
              src: this.cover,
              alt: '',
              onerror: (e: any) => {
                e.target.style.display = 'none';
              },
            })
          )
        : null,
      m('div', { className: 'Form-group LinkRobinsBlog-editor-coverCreditGroup' }, [
        m('label', null, tr('forum.edit_post.cover_credit_label')),
        m('textarea', {
          className: 'FormControl',
          rows: 2,
          value: this.coverCredit || '',
          disabled: this.saving,
          placeholder: tr('forum.edit_post.cover_credit_placeholder'),
          oninput: (e: any) => {
            this.coverCredit = e.target.value;
          },
        }),
        m('div', { className: 'helpText' }, tr('forum.edit_post.cover_credit_help')),
        m('label', { className: 'LinkRobinsBlog-editor-coverCreditUrlLabel' }, tr('forum.edit_post.cover_credit_url_label')),
        m('input', {
          type: 'url',
          className: 'FormControl',
          value: this.coverCreditUrl || '',
          disabled: this.saving,
          placeholder: tr('forum.edit_post.cover_credit_url_placeholder'),
          oninput: (e: any) => {
            this.coverCreditUrl = e.target.value;
          },
        }),
        m('div', { className: 'helpText' }, tr('forum.edit_post.cover_credit_url_help')),
      ]),
    ]);
  }

  _pickCoverFile() {
    if (this._coverFileInput) this._coverFileInput.click();
  }

  _uploadCover(file: File) {
    if (!file) return;
    this.coverUploading = true;
    this.coverUploadError = null;
    m.redraw();

    const body = new FormData();
    body.append('files[]', file);

    app
      .request({
        method: 'POST',
        url: `${app.forum.attribute('apiUrl')}/fof/upload`,
        serialize: (raw: any) => raw,
        body,
      })
      .then((resp: any) => {
        this.coverUploading = false;
        const data = resp && resp.data;
        const uploaded = (data && data[0]) || null;
        const url = uploaded && uploaded.attributes && uploaded.attributes.url;
        if (url) {
          this.cover = url;
        } else {
          this.coverUploadError = tr('forum.edit_post.upload_no_url');
        }
        m.redraw();
      })
      .catch((err: any) => {
        this.coverUploading = false;
        console.error('[linkrobins/blog] cover upload failed:', err);
        let msg = tr('forum.edit_post.upload_failed');
        if (err && err.response && err.response.errors && err.response.errors[0]) {
          const e = err.response.errors[0];
          msg = e.detail || e.title || msg;
        } else if (err && err.status === 404) {
          msg = tr('forum.edit_post.upload_endpoint_missing');
        }
        this.coverUploadError = msg;
        m.redraw();
      });
  }

  _renderMeta() {
    return m('div', { className: 'LinkRobinsBlog-editor-row' }, [
      m('div', { className: 'Form-group' }, [
        m('label', null, tr('forum.edit_post.category_label')),
        m(
          'select',
          {
            className: 'FormControl',
            value: this.categoryId,
            disabled: this.saving,
            onchange: (e: any) => {
              this.categoryId = e.target.value;
            },
          },
          [
            m('option', { value: '' }, tr('forum.edit_post.category_none')),
            (this.categories || []).map((cat: any) => m('option', { value: cat.id, key: `c-${cat.id}` }, cat.attributes.name)),
          ]
        ),
      ]),
      m('div', { className: 'Form-group' }, [
        m('label', null, tr('forum.edit_post.visibility_label')),
        m(
          'select',
          {
            className: 'FormControl',
            value: this.visibility,
            disabled: this.saving,
            onchange: (e: any) => {
              this.visibility = e.target.value;
            },
          },
          [
            m('option', { value: 'public' }, tr('forum.edit_post.visibility_public')),
            m('option', { value: 'members' }, tr('forum.edit_post.visibility_members')),
          ]
        ),
      ]),
      m('div', { className: 'Form-group LinkRobinsBlog-editor-commentsToggle' }, [
        m('label', null, tr('forum.edit_post.comments_label')),
        m('label', { className: 'LinkRobinsBlog-editor-commentsToggle-row' }, [
          m('input', {
            type: 'checkbox',
            checked: this.commentsEnabled !== false,
            disabled: this.saving,
            onchange: (e: any) => {
              this.commentsEnabled = !!e.target.checked;
            },
          }),
          m('span', null, ` ${tr('forum.edit_post.comments_toggle')}`),
        ]),
      ]),
    ]);
  }

  _renderToolbar() {
    // With the real docked composer, the body is written there (its own
    // toolbar + FoF Upload button), so no page toolbar is needed.
    if (blogComposerSupported()) return null;

    // When Flarum's editor is embedded, its own Markdown toolbar replaces
    // these formatting buttons; we keep only the image-upload control
    // (fof/upload), which the core toolbar lacks.
    if (getTextEditor()) {
      if (!isFofUploadInstalled()) return null;
      return m(
        'div',
        { className: 'LinkRobinsBlog-editor-toolbar LinkRobinsBlog-editor-toolbar--uploadOnly' },
        m(
          'button',
          {
            type: 'button',
            className: 'LinkRobinsBlog-editor-toolbarBtn LinkRobinsBlog-editor-toolbarBtn--upload',
            title: tr('forum.edit_post.toolbar_image_title'),
            disabled: this.saving || this.bodyUploading,
            onclick: () => this._pickBodyFiles(),
          },
          [
            this.bodyUploading ? m('i', { className: 'fas fa-spinner fa-spin' }) : m('i', { className: 'fas fa-cloud-upload-alt' }),
            ' ',
            m('span', tr('forum.edit_post.toolbar_image_title')),
          ]
        )
      );
    }

    const btns: Array<{ icon: string; title: any; apply: (ta: HTMLTextAreaElement | null) => void }> = [
      { icon: 'fas fa-bold', title: tr('forum.edit_post.toolbar_bold_title'), apply: (ta) => insertAtCursor(ta, '**', '**', tr('forum.edit_post.snippet_bold')) },
      { icon: 'fas fa-italic', title: tr('forum.edit_post.toolbar_italic_title'), apply: (ta) => insertAtCursor(ta, '*', '*', tr('forum.edit_post.snippet_italic')) },
      { icon: 'fas fa-heading', title: tr('forum.edit_post.toolbar_heading_title'), apply: (ta) => insertAtCursor(ta, '\n## ', '', tr('forum.edit_post.snippet_heading')) },
      {
        icon: 'fas fa-link',
        title: tr('forum.edit_post.toolbar_link_title'),
        apply: (ta) => {
          let url = '';
          try {
            url = window.prompt(tr('forum.edit_post.prompt_url'), 'https://') || '';
          } catch (e) {
            // prompt blocked
          }
          if (!url) return;
          insertAtCursor(ta, '[', `](${url})`, tr('forum.edit_post.snippet_link'));
        },
      },
      {
        icon: 'fas fa-image',
        title: tr('forum.edit_post.toolbar_image_url_title'),
        apply: (ta) => {
          let url = '';
          try {
            url = window.prompt(tr('forum.edit_post.prompt_image_url'), 'https://') || '';
          } catch (e) {
            // prompt blocked
          }
          if (!url) return;
          insertAtCursor(ta, '![', `](${url})`, tr('forum.edit_post.snippet_image'));
        },
      },
      { icon: 'fas fa-code', title: tr('forum.edit_post.toolbar_inline_code_title'), apply: (ta) => insertAtCursor(ta, '`', '`', tr('forum.edit_post.snippet_inline_code')) },
      { icon: 'fas fa-file-code', title: tr('forum.edit_post.toolbar_code_block_title'), apply: (ta) => insertAtCursor(ta, '\n```\n', '\n```\n', tr('forum.edit_post.snippet_code_block')) },
      { icon: 'fas fa-eye-slash', title: tr('forum.edit_post.toolbar_spoiler_title'), apply: (ta) => insertAtCursor(ta, '[spoiler]', '[/spoiler]', tr('forum.edit_post.snippet_spoiler')) },
      {
        icon: 'fas fa-table',
        title: tr('forum.edit_post.toolbar_table_title'),
        apply: (ta) => {
          const col = tr('forum.edit_post.snippet_table_column');
          const cell = tr('forum.edit_post.snippet_table_cell');
          insertAtCursor(
            ta,
            `\n| ${col} 1 | ${col} 2 | ${col} 3 |\n| --- | --- | --- |\n| ${cell} | ${cell} | ${cell} |\n| ${cell} | ${cell} | ${cell} |\n`,
            '',
            ''
          );
        },
      },
      { icon: 'fas fa-quote-right', title: tr('forum.edit_post.toolbar_quote_title'), apply: (ta) => insertAtCursor(ta, '\n> ', '', tr('forum.edit_post.snippet_quote')) },
      { icon: 'fas fa-list-ul', title: tr('forum.edit_post.toolbar_bulleted_list_title'), apply: (ta) => insertAtCursor(ta, '\n- ', '', tr('forum.edit_post.snippet_list_item')) },
      { icon: 'fas fa-list-ol', title: tr('forum.edit_post.toolbar_numbered_list_title'), apply: (ta) => insertAtCursor(ta, '\n1. ', '', tr('forum.edit_post.snippet_list_item')) },
    ];

    const children: any[] = btns.map((b) =>
      m(
        'button',
        {
          type: 'button',
          className: 'LinkRobinsBlog-editor-toolbarBtn',
          title: b.title,
          disabled: this.saving,
          onclick: () => {
            const ta = document.getElementById('LinkRobinsBlog-editor-body') as HTMLTextAreaElement | null;
            b.apply(ta);
          },
        },
        m('i', { className: b.icon })
      )
    );

    if (isFofUploadInstalled()) {
      children.push(m('span', { className: 'LinkRobinsBlog-editor-toolbarSep' }));
      children.push(
        m(
          'button',
          {
            type: 'button',
            className: 'LinkRobinsBlog-editor-toolbarBtn LinkRobinsBlog-editor-toolbarBtn--upload',
            title: tr('forum.edit_post.toolbar_image_title'),
            disabled: this.saving || this.bodyUploading,
            onclick: () => this._pickBodyFiles(),
          },
          [this.bodyUploading ? m('i', { className: 'fas fa-spinner fa-spin' }) : m('i', { className: 'fas fa-cloud-upload-alt' })]
        )
      );
    }

    return m('div', { className: 'LinkRobinsBlog-editor-toolbar' }, children);
  }

  _renderBody() {
    const hasFofUpload = isFofUploadInstalled();

    let bodyInput: any;
    if (blogComposerSupported()) {
      // Write the body in Flarum's real docked composer (rich text, FoF
      // Upload, @mentions and emoji all work). The page shows the same
      // click-to-write placeholder + live preview used at the end of a
      // discussion.
      bodyInput = m(
        'div',
        { className: 'LinkRobinsBlog-bodyPlaceholder' },
        blogComposerPreview({
          composing: blogComposerOpenFor('post-body'),
          placeholder: tr('forum.edit_post.body_placeholder_click'),
          onclick: () => this._openBodyComposer(),
        })
      );
    } else {
      bodyInput = m('textarea', {
        id: 'LinkRobinsBlog-editor-body',
        className: 'FormControl LinkRobinsBlog-editor-bodyInput',
        value: this.bodyText,
        disabled: this.saving,
        rows: 16,
        placeholder: tr('forum.edit_post.body_placeholder'),
        oninput: (e: any) => {
          this.bodyText = e.target.value;
        },
      });
    }

    return m('div', { className: 'LinkRobinsBlog-editor-bodyGroup' }, [
      bodyInput,
      hasFofUpload
        ? m('input', {
            type: 'file',
            accept: 'image/*',
            multiple: true,
            style: 'display: none;',
            oncreate: (vnode: any) => {
              this._bodyFileInput = vnode.dom;
            },
            onchange: (e: any) => {
              const files = e.target && e.target.files;
              if (files && files.length) this._uploadBodyFiles(files);
              if (e.target) e.target.value = '';
            },
          })
        : null,
      this.bodyUploading
        ? m('div', { className: 'LinkRobinsBlog-editor-bodyUploadStatus' }, [
            m('i', { className: 'fas fa-spinner fa-spin' }),
            ` ${tr('forum.edit_post.body_upload_status', { index: this.bodyUploadIndex || 0, total: this.bodyUploadTotal || 0 })}`,
          ])
        : null,
      this.bodyUploadError
        ? m(
            'div',
            { className: 'Alert Alert--danger LinkRobinsBlog-editor-bodyUploadError' },
            m('span', { className: 'Alert-body' }, this.bodyUploadError)
          )
        : null,
    ]);
  }

  _pickBodyFiles() {
    if (this._bodyFileInput) this._bodyFileInput.click();
  }

  _uploadBodyFiles(files: FileList) {
    const list: File[] = Array.prototype.slice.call(files);
    if (!list.length) return;

    this.bodyUploading = true;
    this.bodyUploadTotal = list.length;
    this.bodyUploadIndex = 0;
    this.bodyUploadError = null;
    m.redraw();

    const processNext = (i: number) => {
      if (i >= list.length) {
        this.bodyUploading = false;
        this.bodyUploadIndex = 0;
        this.bodyUploadTotal = 0;
        m.redraw();
        return;
      }
      this.bodyUploadIndex = i + 1;
      m.redraw();

      const file = list[i];
      const body = new FormData();
      body.append('files[]', file);

      app
        .request({
          method: 'POST',
          url: `${app.forum.attribute('apiUrl')}/fof/upload`,
          serialize: (raw: any) => raw,
          body,
        })
        .then((resp: any) => {
          const data = resp && resp.data;
          const uploaded = (data && data[0]) || null;
          const url = uploaded && uploaded.attributes && uploaded.attributes.url;
          const name = (uploaded && uploaded.attributes && (uploaded.attributes.baseName || uploaded.attributes.path)) || file.name || 'image';
          if (url) {
            const snippet = `![${name.replace(/[\[\]]/g, '')}](${url})`;
            const editor = this._bodyComposer && this._bodyComposer.editor;
            if (editor && typeof editor.insertAt === 'function' && editor.el) {
              // Insert into the embedded core editor; its oninput fires
              // onchange, keeping bodyText synced.
              const curVal = editor.el.value || '';
              const lead = curVal && !/\n\n$/.test(curVal) ? '\n\n' : '';
              editor.insertAt(curVal.length, `${lead}${snippet}\n\n`);
            } else {
              // Fallback: the plain textarea (no embedded editor).
              const ta = document.getElementById('LinkRobinsBlog-editor-body') as HTMLTextAreaElement | null;
              if (ta && typeof ta.selectionStart === 'number') {
                const insertText = `${ta.value && !/\n\n$/.test(ta.value) && ta.selectionStart === ta.value.length ? '\n\n' : ''}${snippet}\n\n`;
                const start = ta.selectionStart;
                const end = ta.selectionEnd;
                ta.value = ta.value.slice(0, start) + insertText + ta.value.slice(end);
                const pos = start + insertText.length;
                ta.selectionStart = ta.selectionEnd = pos;
                this.bodyText = ta.value;
              } else {
                const sep = this.bodyText && !/\n\n$/.test(this.bodyText) ? '\n\n' : '';
                this.bodyText = `${this.bodyText || ''}${sep}${snippet}\n\n`;
              }
            }
          }
          processNext(i + 1);
        })
        .catch((err: any) => {
          console.error('[linkrobins/blog] body upload failed:', err);
          let msg = tr('forum.edit_post.upload_failed');
          if (err && err.response && err.response.errors && err.response.errors[0]) {
            const e = err.response.errors[0];
            msg = e.detail || e.title || msg;
          } else if (err && err.status === 404) {
            msg = tr('forum.edit_post.upload_endpoint_missing');
          }
          this.bodyUploading = false;
          this.bodyUploadError = `${msg} (${file.name || 'file'})`;
          this.bodyUploadIndex = 0;
          this.bodyUploadTotal = 0;
          m.redraw();
        });
    };

    processNext(0);
  }

  // Live body text: the composer's content while it's open for this post,
  // otherwise the last-synced value.
  _currentBody(): string {
    return blogComposerOpenFor('post-body') ? blogComposerContent() : this.bodyText || '';
  }

  _renderActions() {
    const hasTitle = (this.titleText || '').trim() !== '';
    const hasBody = this._currentBody().trim() !== '';
    const canSave = hasTitle && hasBody && !this.saving;

    const children: any[] = [
      m('div', { className: 'LinkRobinsBlog-editor-actions-primary' }, [
        m(
          'button',
          {
            type: 'button',
            className: 'Button Button--primary',
            disabled: !canSave,
            onclick: () => this._save(true),
          },
          this.saving
            ? tr('forum.edit_post.saving')
            : this.editId
              ? this.isPublished
                ? tr('forum.edit_post.update_button')
                : tr('forum.edit_post.publish_button')
              : tr('forum.edit_post.publish_button')
        ),
        m(
          'button',
          {
            type: 'button',
            className: 'Button',
            disabled: !canSave,
            onclick: () => this._save(false),
          },
          this.saving ? tr('forum.edit_post.saving') : tr('forum.edit_post.save_draft_button')
        ),
        m(
          'button',
          {
            type: 'button',
            className: 'Button Button--text',
            disabled: this.saving,
            onclick: () => this._leaveEditor(),
          },
          tr('forum.edit_post.cancel_button')
        ),
      ]),
    ];

    if (this.editId) {
      children.push(
        m(
          'button',
          {
            type: 'button',
            className: 'Button Button--text LinkRobinsBlog-editor-deleteBtn',
            disabled: this.saving,
            onclick: () => {
              if (!window.confirm(tr('forum.post.delete_confirm'))) return;
              this.saving = true;
              this.error = null;
              m.redraw();
              deleteBlogPost(this.editId)
                .then(() => {
                  this._closeComposer();
                  broadcastBlogRefresh({ type: 'delete', postId: this.editId });
                  m.route.set(blogIndexRoute());
                })
                .catch((err: any) => {
                  this.saving = false;
                  this.error = err;
                  m.redraw();
                });
            },
          },
          tr('forum.edit_post.delete_button')
        )
      );
    }

    return m('div', { className: 'LinkRobinsBlog-editor-actions' }, children);
  }

  // Open the docked composer to write the post body. The body editor (rich
  // text / upload / mentions / emoji) lives there; the page's Publish /
  // Save-draft buttons read its content at save time. The composer's own
  // submit triggers the primary action (Publish/Update).
  _openBodyComposer() {
    const primaryLabel = this.editId
      ? this.isPublished
        ? tr('forum.edit_post.update_button')
        : tr('forum.edit_post.publish_button')
      : tr('forum.edit_post.publish_button');
    openBlogComposer({
      blogContext: 'post-body',
      className: 'LinkRobinsBlog-postComposer',
      placeholder: tr('forum.edit_post.body_placeholder'),
      submitLabel: primaryLabel,
      confirmExit: tr('forum.edit_post.discard_confirm'),
      originalContent: this.bodyText || '',
      blogHeaderItems: () => [
        {
          name: 'title',
          content: m('h3', { className: 'LinkRobinsBlog-composerTitle' }, [
            m('i', { className: 'fas fa-feather-alt' }),
            ' ',
            (this.titleText || '').trim() || tr('forum.edit_post.title_create'),
          ]),
        },
      ],
      onBlogSubmit: (content: string, body: any) => {
        this._save(true, content, body);
      },
    });
  }

  _closeComposer() {
    try {
      if (blogComposerOpenFor('post-body') && app.composer && app.composer.hide) {
        app.composer.hide();
      }
    } catch (e) {
      // composer already gone
    }
  }

  _leaveEditor() {
    try {
      if (blogComposerOpenFor('post-body') && app.composer && app.composer.close) {
        app.composer.close();
      }
    } catch (e) {
      // composer already gone
    }
    m.route.set(blogIndexRoute());
  }

  // Save the post. Called from the page buttons (no content arg — it reads
  // the live composer/textarea body) or from the composer submit with
  // (publishFlag=true, content, composerBody).
  _save(publishFlag: boolean, content?: string, composerBody?: any) {
    const bodyText = typeof content === 'string' ? content : this._currentBody();
    this.bodyText = bodyText;

    if (!(this.titleText || '').trim() || !(bodyText || '').trim()) {
      this.error = { _local: tr('forum.edit_post.title_body_required') };
      if (composerBody) composerBody.loading = false;
      m.redraw();
      return;
    }

    this.saving = true;
    this.error = null;
    if (composerBody) composerBody.loading = true;
    m.redraw();

    const attributes: any = {
      title: this.titleText.trim(),
      slug: this.slug.trim() || slugify(this.titleText),
      excerpt: this.excerpt || '',
      content: bodyText,
      coverImageUrl: this.cover || null,
      coverImageCredit: (this.coverCredit && this.coverCredit.trim()) || null,
      coverImageCreditUrl: (this.coverCreditUrl && this.coverCreditUrl.trim()) || null,
      visibility: this.visibility,
      isPublished: publishFlag,
      commentsEnabled: this.commentsEnabled !== false,
    };
    if (publishFlag && (!this.editId || !this.isPublished)) {
      attributes.publishedAt = new Date().toISOString();
    }

    const categoryId = this.categoryId || null;
    const clearCategory = !categoryId;

    const promise = this.editId
      ? updateBlogPost(this.editId, attributes, categoryId, clearCategory)
      : createBlogPost(attributes, categoryId);

    promise
      .then((resp: any) => {
        this.saving = false;
        this._closeComposer();
        if (composerBody && composerBody.composer) {
          try {
            composerBody.composer.hide();
          } catch (e) {
            // composer already gone
          }
        }
        broadcastBlogRefresh({ type: 'save' });
        invalidateCategoriesCache();
        // Go to the published article, or the drafts list for a draft.
        const post = resp && resp.data;
        if (publishFlag && post) {
          m.route.set(postPath(post));
        } else {
          m.route.set(`/${BLOG_SLUG}/drafts`);
        }
      })
      .catch((err: any) => {
        this.saving = false;
        if (composerBody) composerBody.loading = false;
        this.error = err;
        console.error('[linkrobins/blog] save failed:', err);
        m.redraw();
      });
  }
}
