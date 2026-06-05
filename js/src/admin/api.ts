import app from 'flarum/admin/app';

export function fetchCategoriesList(): Promise<any> {
  return app.request({
    method: 'GET',
    url: `${app.forum.attribute('apiUrl')}/linkrobins-blog-categories`,
    params: { sort: 'position', page: { limit: 100 } },
  });
}

export function createBlogCategory(attributes: any): Promise<any> {
  return app.request({
    method: 'POST',
    url: `${app.forum.attribute('apiUrl')}/linkrobins-blog-categories`,
    body: { data: { type: 'linkrobins-blog-categories', attributes } },
  });
}

export function updateBlogCategory(id: any, attributes: any): Promise<any> {
  return app.request({
    method: 'PATCH',
    url: `${app.forum.attribute('apiUrl')}/linkrobins-blog-categories/${encodeURIComponent(id)}`,
    body: { data: { type: 'linkrobins-blog-categories', id: String(id), attributes } },
  });
}

export function deleteBlogCategory(id: any): Promise<any> {
  return app.request({
    method: 'DELETE',
    url: `${app.forum.attribute('apiUrl')}/linkrobins-blog-categories/${encodeURIComponent(id)}`,
  });
}
