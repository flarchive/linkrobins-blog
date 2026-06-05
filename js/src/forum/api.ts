import app from 'flarum/forum/app';

let allCategoriesCache: any[] | null = null;
let allCategoriesPromise: Promise<any[]> | null = null;

export function getAllCategoriesCache(): any[] | null {
  return allCategoriesCache;
}

export function loadAllCategories(force?: boolean): Promise<any[]> {
  if (force) {
    allCategoriesCache = null;
    allCategoriesPromise = null;
  }
  if (allCategoriesCache) return Promise.resolve(allCategoriesCache);
  if (allCategoriesPromise) return allCategoriesPromise;

  allCategoriesPromise = app
    .request({
      method: 'GET',
      url: `${app.forum.attribute('apiUrl')}/linkrobins-blog-categories`,
      params: { sort: 'position', page: { limit: 100 } },
    })
    .then((resp: any) => {
      allCategoriesCache = (resp && resp.data) || [];
      return allCategoriesCache!;
    })
    .catch((err: any) => {
      console.error('[linkrobins/blog] could not load categories:', err);
      allCategoriesPromise = null;
      return [];
    });

  return allCategoriesPromise;
}

export function fetchPosts(opts: { offset?: number; limit?: number; categoryId?: any; draftsOnly?: boolean; userId?: any }): Promise<any> {
  const params: any = {
    sort: opts.draftsOnly ? '-createdAt' : '-publishedAt',
    page: { offset: opts.offset || 0, limit: opts.limit || 12 },
    include: 'user,category',
  };
  if (opts.categoryId) params.categoryId = opts.categoryId;
  if (opts.draftsOnly) params.isPublished = 'false';
  if (opts.userId) params.userId = opts.userId;

  return app.request({
    method: 'GET',
    url: `${app.forum.attribute('apiUrl')}/linkrobins-blog-posts`,
    params,
  });
}

export function fetchPost(slug: string): Promise<any> {
  return app.request({
    method: 'GET',
    url: `${app.forum.attribute('apiUrl')}/linkrobins-blog-posts/${encodeURIComponent(slug)}`,
    params: { include: 'user,category' },
  });
}

export function fetchCategoriesList(): Promise<any> {
  return app.request({
    method: 'GET',
    url: `${app.forum.attribute('apiUrl')}/linkrobins-blog-categories`,
    params: { sort: 'position', page: { limit: 100 } },
  });
}

export function createBlogPost(attributes: any, categoryId: any): Promise<any> {
  const rels: any = {};
  if (categoryId) {
    rels.category = { data: { type: 'linkrobins-blog-categories', id: String(categoryId) } };
  }
  return app.request({
    method: 'POST',
    url: `${app.forum.attribute('apiUrl')}/linkrobins-blog-posts`,
    body: {
      data: {
        type: 'linkrobins-blog-posts',
        attributes,
        relationships: rels,
      },
    },
  });
}

export function updateBlogPost(id: any, attributes: any, categoryId: any, clearCategory: boolean): Promise<any> {
  const rels: any = {};
  if (categoryId) {
    rels.category = { data: { type: 'linkrobins-blog-categories', id: String(categoryId) } };
  } else if (clearCategory) {
    rels.category = { data: null };
  }
  const body: any = {
    data: {
      type: 'linkrobins-blog-posts',
      id: String(id),
      attributes,
    },
  };
  if (Object.keys(rels).length) body.data.relationships = rels;

  return app.request({
    method: 'PATCH',
    url: `${app.forum.attribute('apiUrl')}/linkrobins-blog-posts/${encodeURIComponent(id)}`,
    body,
  });
}

export function deleteBlogPost(postId: any): Promise<any> {
  return app.request({
    method: 'DELETE',
    url: `${app.forum.attribute('apiUrl')}/linkrobins-blog-posts/${encodeURIComponent(postId)}`,
  });
}

// Shared categories cache used by the post editor. We fetch once and reuse
// across opens; categories rarely change and re-fetching on every open feels
// sluggish.
let categoriesCache: any[] | null = null;
let categoriesLoading = false;
let categoriesWaiters: Array<(cats: any[]) => void> = [];

export function loadCategoriesForEditor(cb: (cats: any[]) => void): void {
  if (categoriesCache) {
    cb(categoriesCache);
    return;
  }
  categoriesWaiters.push(cb);
  if (categoriesLoading) return;
  categoriesLoading = true;

  const settle = (cats: any[]) => {
    categoriesCache = cats;
    categoriesLoading = false;
    const waiters = categoriesWaiters.slice();
    categoriesWaiters.length = 0;
    waiters.forEach((w) => {
      try {
        w(cats);
      } catch (e) {
        console.error('[linkrobins/blog] categories waiter failed:', e);
      }
    });
  };

  fetchCategoriesList()
    .then((resp: any) => settle((resp && resp.data) || []))
    .catch((err: any) => {
      console.error('[linkrobins/blog] could not load categories:', err);
      settle([]);
    });
}

export function invalidateCategoriesCache(): void {
  categoriesCache = null;
}
