import type { Integration } from '../types'
import { simulatePayment } from './actions'
import { handle, verify } from './webhook'

/** Stripe (test mode): payments in, orders out. A platform integration (ADR 0003). */
export const stripe: Integration = {
  id: 'stripe',
  kind: 'platform',
  displayName: 'Stripe',
  webhook: { verify, handle },
  actions: {
    simulate_payment: simulatePayment,
  },
}
