import type { Integration } from '../types'

/**
 * Claude (Anthropic API): order summaries and draft replies. A platform
 * integration (ADR 0003): OpsHub's own API key. It has no queued actions;
 * a team member waits for the answer, so calls run in the request
 * (server/api/orders/[id]/ai.post.ts) and are logged like any other call.
 */
export const claude: Integration = {
  id: 'claude',
  kind: 'platform',
  displayName: 'Claude',
  actions: {},
}
