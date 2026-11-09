export interface ProviderInfo {
  label: string
  icon: string
  /** The phase that adds it, for the Connections page. */
  phase: number
  description: string
}

export const providers: Record<string, ProviderInfo> = {
  stripe: { label: 'Stripe', icon: 'i-simple-icons-stripe', phase: 1, description: 'Payments (test mode). Checkout and simulated orders arrive as signed webhooks.' },
  easypost: { label: 'EasyPost', icon: 'i-lucide-truck', phase: 2, description: 'Shipping labels and tracking webhooks (test mode).' },
  slack: { label: 'Slack', icon: 'i-simple-icons-slack', phase: 3, description: 'Notifications when orders ship, deliver, fail or get stuck.' },
  hubspot: { label: 'HubSpot', icon: 'i-simple-icons-hubspot', phase: 4, description: 'Contacts and deals that follow each order.' },
  google: { label: 'Google', icon: 'i-simple-icons-google', phase: 5, description: 'Follow-up emails via Gmail and calls via Calendar.' },
  claude: { label: 'Claude', icon: 'i-simple-icons-anthropic', phase: 6, description: 'Order summaries and draft customer replies.' },
  discord: { label: 'Discord', icon: 'i-simple-icons-discord', phase: 7, description: 'A second chat target, added to prove the plug-in interface.' },
}

export const providerInfo = (id: string): ProviderInfo =>
  providers[id] ?? { label: id, icon: 'i-lucide-plug', phase: 0, description: '' }
