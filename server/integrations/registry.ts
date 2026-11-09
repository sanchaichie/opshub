import { easypost } from './easypost'
import { opshub } from './opshub'
import { stripe } from './stripe'
import type { Integration, ProviderId } from './types'

/**
 * Every integration the app knows about. Adding a provider = implement
 * `Integration` in its own folder and add one line here.
 */
const integrations: Partial<Record<ProviderId, Integration>> = {
  opshub,
  stripe,
  easypost,
}

export function getIntegration(id: string): Integration | undefined {
  return Object.hasOwn(integrations, id) ? integrations[id as ProviderId] : undefined
}

export function listIntegrations(): Integration[] {
  return Object.values(integrations)
}
