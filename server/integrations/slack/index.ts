import type { Integration } from '../types'
import { notifyOrder } from './actions'
import { slackOAuth } from './oauth'

/** Slack: order notifications in the channel each org chooses. A connected integration (ADR 0003). */
export const slack: Integration = {
  id: 'slack',
  kind: 'connected',
  displayName: 'Slack',
  oauth: slackOAuth,
  actions: {
    notify_order: notifyOrder,
  },
}
