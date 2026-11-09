import type { LineItem } from './schemas'

/**
 * A tiny product catalog for the demo store, used by Checkout and by
 * "Simulate order". Prices live on the server, so the browser can't choose
 * what it pays.
 */
export const PRODUCTS = [
  { sku: 'mug', name: 'OpsHub Mug', unit_amount: 1800 },
  { sku: 'tee', name: 'Uptime T-shirt', unit_amount: 2900 },
  { sku: 'stickers', name: 'Sticker Pack', unit_amount: 600 },
  { sku: 'hoodie', name: 'Retry-Proof Hoodie', unit_amount: 5900 },
  { sku: 'notebook', name: 'Incident Notebook', unit_amount: 1200 },
] as const

export type Sku = (typeof PRODUCTS)[number]['sku']

export interface ShippingAddress {
  name: string
  street1: string
  street2?: string
  city: string
  state?: string
  zip?: string
  country: string
}

/**
 * Real public buildings with correct ZIP codes, so carriers' test APIs accept
 * them, but no private person's address.
 */
const ADDRESSES: Omit<ShippingAddress, 'name'>[] = [
  { street1: '1 Market St', city: 'San Francisco', state: 'CA', zip: '94105', country: 'US' },
  { street1: '233 S Wacker Dr', city: 'Chicago', state: 'IL', zip: '60606', country: 'US' },
  { street1: '1000 4th Ave', city: 'Seattle', state: 'WA', zip: '98104', country: 'US' },
  { street1: '700 Congress Ave', city: 'Austin', state: 'TX', zip: '78701', country: 'US' },
  { street1: '1 Brattle Sq', city: 'Cambridge', state: 'MA', zip: '02138', country: 'US' },
  { street1: '100 Peachtree St NW', city: 'Atlanta', state: 'GA', zip: '30303', country: 'US' },
]

const FIRST_NAMES = ['Ava', 'Ben', 'Chloe', 'Dev', 'Elena', 'Femi', 'Grace', 'Hiro', 'Isla', 'Jonas']
const LAST_NAMES = ['Nakamura', 'Okafor', 'Silva', 'Novak', 'Haddad', 'Lindqvist', 'Reyes', 'Patel']

/** A plausible random order: 1–3 distinct products, quantity 1–2 each. */
export function randomOrder(random: () => number = Math.random): { items: LineItem[], customer: { name: string, email: string }, shipping: ShippingAddress } {
  const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)]!
  const shuffled = [...PRODUCTS].sort(() => random() - 0.5)
  const count = 1 + Math.floor(random() * 3)

  const items = shuffled.slice(0, count).map(p => ({
    name: p.name,
    quantity: 1 + Math.floor(random() * 2),
    unit_amount: p.unit_amount,
  }))

  const first = pick(FIRST_NAMES)
  const last = pick(LAST_NAMES)
  // example.com is reserved for documentation, so no real inbox ever gets mail.
  const email = `${first}.${last}.${Math.floor(random() * 10_000)}@example.com`.toLowerCase()

  const name = `${first} ${last}`
  return { items, customer: { name, email }, shipping: { name, ...pick(ADDRESSES) } }
}

/** Stripe's `shipping` shape, for PaymentIntents and Checkout's payment_intent_data. */
export function toStripeShipping(address: ShippingAddress) {
  return {
    name: address.name,
    address: {
      line1: address.street1,
      line2: address.street2,
      city: address.city,
      state: address.state,
      postal_code: address.zip,
      country: address.country,
    },
  }
}

export const orderTotal = (items: LineItem[]) => items.reduce((sum, i) => sum + i.unit_amount * i.quantity, 0)
