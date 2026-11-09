import { z } from 'zod'

/** Only the fields OpsHub reads; loose so EasyPost can add fields freely. */

export const trackerSchema = z.looseObject({
  id: z.string().startsWith('trk_'),
  object: z.literal('Tracker'),
  tracking_code: z.string(),
  status: z.string(),
  status_detail: z.string().nullable().optional(),
  carrier: z.string().nullable().optional(),
  shipment_id: z.string().nullable().optional(),
  public_url: z.url({ protocol: /^https$/ }).nullable().optional(),
  est_delivery_date: z.string().nullable().optional(),
})
export type Tracker = z.infer<typeof trackerSchema>

export const easypostEventSchema = z.looseObject({
  id: z.string().startsWith('evt_'),
  object: z.literal('Event'),
  description: z.string(),
  mode: z.enum(['test', 'production']),
  result: z.looseObject({}),
})

export const rateSchema = z.looseObject({
  id: z.string(),
  carrier: z.string(),
  service: z.string(),
  rate: z.string(),
  currency: z.string(),
})

export const shipmentSchema = z.looseObject({
  id: z.string().startsWith('shp_'),
  rates: z.array(rateSchema).default([]),
  tracking_code: z.string().nullable().optional(),
  selected_rate: rateSchema.nullable().optional(),
  // https only: this URL is rendered as a link in the UI.
  postage_label: z.looseObject({ label_url: z.url({ protocol: /^https$/ }).nullable().optional() }).nullable().optional(),
})
export type Shipment = z.infer<typeof shipmentSchema>

export const orderAddressSchema = z.object({
  name: z.string(),
  street1: z.string(),
  street2: z.string().optional(),
  city: z.string(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().length(2),
})

/** Cheapest rate first; EasyPost sends amounts as decimal strings. */
export function cheapestRate(shipment: Shipment) {
  return [...shipment.rates].sort((a, b) => Number.parseFloat(a.rate) - Number.parseFloat(b.rate))[0] ?? null
}
