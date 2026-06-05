import app from 'flarum/forum/app';

import { tr, readForumAttribute } from './utils';

// Newsletter subscribe state. Lives at module scope so the multiple sidebar
// instances (desktop + mobile) share it and stay in sync across redraws.
// Initial state comes from the forum payload.
const state: { subscribed: boolean | null; busy: boolean; error: any } = {
  subscribed: null,
  busy: false,
  error: null,
};

export function newsletterState() {
  return state;
}

export function newsletterInitState(): void {
  if (state.subscribed === null) {
    state.subscribed = !!readForumAttribute('linkrobinsBlogSubscribed');
  }
}

function apiUrl(): string {
  return `${app.forum.attribute('apiUrl')}/linkrobins-blog/subscription`;
}

function setState(next: Partial<typeof state>): void {
  Object.assign(state, next);
  try {
    m.redraw();
  } catch (e) {
    // redraw outside a mounted app is a no-op
  }
}

export function newsletterSubscribe(): void {
  if (state.busy) return;
  setState({ busy: true, error: null });
  app
    .request({ method: 'POST', url: apiUrl() })
    .then((resp: any) => {
      setState({ busy: false, subscribed: !!(resp && resp.subscribed) });
    })
    .catch((err: any) => {
      console.error('[linkrobins/blog] subscribe failed:', err);
      setState({ busy: false, error: tr('forum.subscribe.subscribe_failed') });
      try {
        alert(tr('forum.subscribe.subscribe_failed'));
      } catch (e) {
        // alerts can be blocked
      }
    });
}

export function newsletterUnsubscribe(): void {
  if (state.busy) return;
  setState({ busy: true, error: null });
  app
    .request({ method: 'DELETE', url: apiUrl() })
    .then((resp: any) => {
      setState({ busy: false, subscribed: !!(resp && resp.subscribed) });
    })
    .catch((err: any) => {
      console.error('[linkrobins/blog] unsubscribe failed:', err);
      setState({ busy: false, error: tr('forum.subscribe.unsubscribe_failed') });
      try {
        alert(tr('forum.subscribe.unsubscribe_failed'));
      } catch (e) {
        // alerts can be blocked
      }
    });
}
