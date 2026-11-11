import type { Integration } from '../types'
import { syncDeal } from './actions'
import { hubspotOAuth } from './oauth'

/** HubSpot CRM: a contact and deal for every order. A connected integration (ADR 0003). */
export const hubspot: Integration = {
  id: 'hubspot',
  kind: 'connected',
  displayName: 'HubSpot',
  oauth: hubspotOAuth,
  actions: {
    // The action needs this integration itself (for token refresh), hence the thunk.
    sync_deal: syncDeal(() => hubspot),
  },
}
