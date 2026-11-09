import { z } from 'zod'

/**
 * Only the fields OpsHub reads. Loose objects let Stripe add fields without
 * breaking parsing; anything we depend on is validated.
 */

export const lineItemSchema = z.object({
  name: z.string(),
  quantity: z.number().int().positive(),
  unit_amount: z.number().int().nonnegative(),
})
export type LineItem = z.infer<typeof lineItemSchema>

/** Metadata OpsHub attaches to every PaymentIntent it creates. */
export const opshubMetadataSchema = z.looseObject({
  org_id: z.uuid().optional(),
  source: z.enum(['checkout', 'simulated']).optional(),
  customer_name: z.string().optional(),
  customer_email: z.string().optional(),
  // Stripe metadata values are strings, so line items travel as JSON.
  line_items: z.string().optional(),
})

export const paymentIntentSchema = z.looseObject({
  id: z.string().startsWith('pi_'),
  object: z.literal('payment_intent'),
  amount: z.number().int().nonnegative(),
  amount_received: z.number().int().nonnegative().optional(),
  currency: z.string().length(3),
  status: z.string(),
  customer: z.string().nullable().optional(),
  receipt_email: z.string().nullable().optional(),
  latest_charge: z.string().nullable().optional(),
  shipping: z.looseObject({
    name: z.string().nullable().optional(),
    address: z.looseObject({
      line1: z.string().nullable().optional(),
      line2: z.string().nullable().optional(),
      city: z.string().nullable().optional(),
      state: z.string().nullable().optional(),
      postal_code: z.string().nullable().optional(),
      country: z.string().nullable().optional(),
    }).nullable().optional(),
  }).nullable().optional(),
  metadata: opshubMetadataSchema.default({}),
})
export type PaymentIntent = z.infer<typeof paymentIntentSchema>

export const stripeEventSchema = z.looseObject({
  id: z.string().startsWith('evt_'),
  object: z.literal('event'),
  type: z.string(),
  livemode: z.boolean(),
  data: z.looseObject({ object: z.looseObject({}) }),
})
export type StripeEvent = z.infer<typeof stripeEventSchema>

export const chargeSchema = z.looseObject({
  id: z.string(),
  billing_details: z.looseObject({
    email: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
  }),
})

/** Stripe's shipping → OpsHub's address shape; null unless the required parts are present. */
export function toShippingAddress(shipping: PaymentIntent['shipping']) {
  const a = shipping?.address
  if (!shipping?.name || !a?.line1 || !a.city || !a.country) return null
  return {
    name: shipping.name,
    street1: a.line1,
    ...(a.line2 ? { street2: a.line2 } : {}),
    city: a.city,
    ...(a.state ? { state: a.state } : {}),
    ...(a.postal_code ? { zip: a.postal_code } : {}),
    country: a.country.toUpperCase(),
  }
}

export function parseLineItems(raw: string | undefined): LineItem[] {
  if (!raw) return []
  try {
    return z.array(lineItemSchema).parse(JSON.parse(raw))
  }
  catch {
    return []
  }
}
