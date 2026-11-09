import type { Integration } from '../types'
import { createShipment, startTracking } from './actions'
import { handle, resolveOrgId, verify } from './webhook'

/** EasyPost (test mode): shipping labels out, tracker webhooks in. A platform integration (ADR 0003). */
export const easypost: Integration = {
  id: 'easypost',
  kind: 'platform',
  displayName: 'EasyPost',
  webhook: { verify, resolveOrgId, handle },
  actions: {
    create_shipment: createShipment,
    start_tracking: startTracking,
  },
}
