import app from 'flarum/admin/app';

// Short helper for translator lookups. Returns the translated string, or the
// key itself if no translation is registered (Flarum's default fallback
// behaviour). All admin-side strings live under 'linkrobins-blog.admin.*'.
export function t(key: string, params?: Record<string, any>): any {
  try {
    return app.translator.trans(`linkrobins-blog.${key}`, params || {});
  } catch (e) {
    return key;
  }
}

export function slugify(s: any): string {
  return String(s || '')
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
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

// Upload a single File via the fof/upload endpoint. Calls cb(url, errMsg).
// url is the file's public URL on success; errMsg is a human-readable string
// on failure.
export function uploadFofFile(file: File | null, cb: (url: string | null, errMsg: any) => void): void {
  if (!file) {
    cb(null, t('admin.settings.upload_no_file'));
    return;
  }
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
      if (url) cb(url, null);
      else cb(null, t('admin.settings.upload_no_url'));
    })
    .catch((err: any) => {
      console.error('[linkrobins/blog] upload failed:', err);
      let msg = t('admin.settings.upload_failed');
      if (err && err.response && err.response.errors && err.response.errors[0]) {
        const e = err.response.errors[0];
        msg = e.detail || e.title || msg;
      } else if (err && err.status === 404) {
        msg = t('admin.settings.upload_endpoint_missing');
      }
      cb(null, msg);
    });
}
