import Modal from 'flarum/common/components/Modal';

import { t, slugify } from '../utils';
import { createBlogCategory, updateBlogCategory } from '../api';

export default class CategoryEditorModal extends Modal {
  static get isDismissibleViaBackdropClick() {
    return false;
  }

  editId: any = null;
  categoryName = '';
  slug = '';
  description = '';
  color = '#7f7f7f';
  icon = 'fas fa-folder';
  position = 0;
  newsletterEnabled = false;
  saving = false;
  error: any = null;

  private _userEditedSlug = false;

  oninit(vnode: any) {
    super.oninit(vnode);
    const cat = (this.attrs as any).category;
    const attr = cat ? cat.attributes || {} : {};
    this.editId = cat ? cat.id : null;
    this.categoryName = attr.name || '';
    this.slug = attr.slug || '';
    this.description = attr.description || '';
    this.color = attr.color || '#7f7f7f';
    this.icon = attr.icon || 'fas fa-folder';
    this.position = typeof attr.position === 'number' ? attr.position : 0;
    this.newsletterEnabled = !!attr.newsletterEnabled;
    this.saving = false;
    this.error = null;
    this._userEditedSlug = !!cat;
  }

  className() {
    return 'Modal--medium LinkRobinsBlog-categoryEditorModal';
  }

  title() {
    return this.editId ? t('admin.edit_category.title_edit') : t('admin.edit_category.title_create');
  }

  content() {
    return m('div', { className: 'Modal-body LinkRobinsBlog-categoryEditor' }, [
      this.error
        ? m('div', { className: 'Alert Alert--danger' }, [
            m('span', { className: 'Alert-body' }, t('admin.edit_category.save_failed', { detail: this._errorMessage() })),
          ])
        : null,

      m('div', { className: 'Form-body' }, [
        m('div', { className: 'Form-group' }, [
          m('label', null, t('admin.edit_category.name_label')),
          m('input', {
            type: 'text',
            className: 'FormControl',
            value: this.categoryName,
            placeholder: t('admin.edit_category.name_placeholder'),
            autofocus: true,
            oninput: (e: any) => {
              this.categoryName = e.target.value;
              if (!this._userEditedSlug) {
                this.slug = slugify(this.categoryName);
              }
            },
          }),
        ]),

        m('div', { className: 'Form-group' }, [
          m('label', null, t('admin.edit_category.slug_label')),
          m('input', {
            type: 'text',
            className: 'FormControl',
            value: this.slug,
            placeholder: t('admin.edit_category.slug_placeholder'),
            oninput: (e: any) => {
              this.slug = e.target.value;
              this._userEditedSlug = true;
            },
          }),
          m('div', { className: 'helpText' }, t('admin.edit_category.slug_help')),
        ]),

        m('div', { className: 'Form-group' }, [
          m('label', null, t('admin.edit_category.description_label')),
          m('textarea', {
            className: 'FormControl',
            rows: 2,
            value: this.description,
            placeholder: t('admin.edit_category.description_placeholder'),
            oninput: (e: any) => {
              this.description = e.target.value;
            },
          }),
        ]),

        m('div', { className: 'Form-group' }, [
          m('label', null, t('admin.edit_category.color_label')),
          m('div', { className: 'LinkRobinsBlog-categoryEditor-colorRow' }, [
            m('input', {
              type: 'color',
              className: 'LinkRobinsBlog-categoryEditor-colorPicker',
              value: /^#[0-9a-fA-F]{6}$/.test(this.color) ? this.color : '#7f7f7f',
              oninput: (e: any) => {
                this.color = e.target.value;
              },
            }),
            m('input', {
              type: 'text',
              className: 'FormControl',
              value: this.color,
              placeholder: t('admin.edit_category.color_placeholder'),
              oninput: (e: any) => {
                this.color = e.target.value;
              },
            }),
          ]),
        ]),

        m('div', { className: 'Form-group' }, [
          m('label', null, t('admin.edit_category.icon_label')),
          m('div', { className: 'LinkRobinsBlog-categoryEditor-iconRow' }, [
            m('span', { className: 'LinkRobinsBlog-categoryEditor-iconPreview' }, m('i', { className: this.icon || 'fas fa-folder' })),
            m('input', {
              type: 'text',
              className: 'FormControl',
              value: this.icon,
              placeholder: t('admin.edit_category.icon_placeholder'),
              oninput: (e: any) => {
                this.icon = e.target.value;
              },
            }),
          ]),
          m('div', { className: 'helpText' }, t('admin.edit_category.icon_help')),
        ]),

        m('div', { className: 'Form-group' }, [
          m('label', null, t('admin.edit_category.position_label')),
          m('input', {
            type: 'number',
            className: 'FormControl',
            value: this.position,
            min: 0,
            step: 1,
            oninput: (e: any) => {
              const v = parseInt(e.target.value, 10);
              this.position = isNaN(v) ? 0 : v;
            },
          }),
          m('div', { className: 'helpText' }, t('admin.edit_category.position_help')),
        ]),

        m('div', { className: 'Form-group' }, [
          m('label', { className: 'LinkRobinsBlog-categoryEditor-toggleRow' }, [
            m('input', {
              type: 'checkbox',
              checked: this.newsletterEnabled,
              onchange: (e: any) => {
                this.newsletterEnabled = !!e.target.checked;
              },
            }),
            ` ${t('admin.edit_category.newsletter_label')}`,
          ]),
          m('div', { className: 'helpText' }, t('admin.edit_category.newsletter_help')),
        ]),
      ]),

      m('div', { className: 'Form-group LinkRobinsBlog-categoryEditor-actions' }, [
        m(
          'button',
          {
            type: 'submit',
            className: 'Button Button--primary',
            disabled: this.saving || !this.categoryName.trim(),
            onclick: (e: any) => {
              e.preventDefault();
              this._save();
            },
          },
          this.saving
            ? t('admin.edit_category.saving')
            : this.editId
              ? t('admin.edit_category.save_button')
              : t('admin.edit_category.create_button')
        ),
        m(
          'button',
          {
            type: 'button',
            className: 'Button',
            disabled: this.saving,
            onclick: () => this.hide(),
          },
          t('admin.edit_category.cancel_button')
        ),
      ]),
    ]);
  }

  _errorMessage() {
    const err = this.error;
    if (!err) return t('admin.edit_category.unknown_error');
    if (err.response && err.response.errors && err.response.errors[0]) {
      const e = err.response.errors[0];
      return e.detail || e.title || e.code || t('admin.edit_category.validation_error');
    }
    return err.message || t('admin.edit_category.unknown_error');
  }

  _save() {
    if (this.saving) return;
    this.saving = true;
    this.error = null;
    m.redraw();

    const attributes: any = {
      name: this.categoryName.trim(),
      description: (this.description || '').trim() || null,
      color: (this.color || '').trim() || null,
      icon: (this.icon || '').trim() || null,
      position: this.position || 0,
      newsletterEnabled: !!this.newsletterEnabled,
    };
    if (this.slug && this.slug.trim() !== '') attributes.slug = this.slug.trim();

    const promise = this.editId ? updateBlogCategory(this.editId, attributes) : createBlogCategory(attributes);

    promise
      .then(() => {
        this.saving = false;
        if (typeof (this.attrs as any).onSaved === 'function') (this.attrs as any).onSaved();
        this.hide();
      })
      .catch((err: any) => {
        this.saving = false;
        this.error = err;
        console.error('[linkrobins/blog] save category failed:', err);
        m.redraw();
      });
  }
}
