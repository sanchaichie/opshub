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

export function parseLineItems(raw: string | undefined): LineItem[] {
  if (!raw) return []
  try {
    return z.array(lineItemSchema).parse(JSON.parse(raw))
  }
  catch {
    return []
  }
}
