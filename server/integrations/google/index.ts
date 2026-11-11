import type { Integration } from '../types'
import { bookCall, sendFollowUp } from './actions'
import { googleOAuth } from './oauth'

/** Gmail + Google Calendar: follow-up emails and customer calls. A connected integration (ADR 0003). */
export const google: Integration = {
  id: 'google',
  kind: 'connected',
  displayName: 'Google',
  oauth: googleOAuth,
  actions: {
    // Actions need this integration itself (for token refresh), hence the thunks.
    send_follow_up: sendFollowUp(() => google),
    book_call: bookCall(() => google),
  },
}
