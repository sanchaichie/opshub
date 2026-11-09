
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "ai_outputs": {
                  Row: {
                    "content": string,"created_at": string,"created_by": string | null,"id": string,"input_tokens": number,"kind": Database["public"]['Enums']["ai_output_kind"],"model": string,"order_id": string,"org_id": string,"output_tokens": number
                  }
                  ComputedFields: never
                  Insert: {
                    "content": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"input_tokens"?: number,"kind": Database["public"]['Enums']["ai_output_kind"],"model": string,"order_id": string,"org_id": string,"output_tokens"?: number
                  }
                  Update: {
                    "content"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"input_tokens"?: number,"kind"?: Database["public"]['Enums']["ai_output_kind"],"model"?: string,"order_id"?: string,"org_id"?: string,"output_tokens"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_outputs_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_outputs_org_id_order_id_fkey"
      columns: ["org_id","order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["org_id","id"]
    }
                  ]
                },"connections": {
                  Row: {
                    "account_label": string | null,"connected_by": string | null,"created_at": string,"external_account_id": string | null,"id": string,"metadata": NonNullable<Json>,"org_id": string,"provider": string,"scopes": (string)[],"status": Database["public"]['Enums']["connection_status"],"token_expires_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_label"?: string | null,"connected_by"?: string | null,"created_at"?: string,"external_account_id"?: string | null,"id"?: string,"metadata"?: NonNullable<Json>,"org_id": string,"provider": string,"scopes"?: (string)[],"status"?: Database["public"]['Enums']["connection_status"],"token_expires_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "account_label"?: string | null,"connected_by"?: string | null,"created_at"?: string,"external_account_id"?: string | null,"id"?: string,"metadata"?: NonNullable<Json>,"org_id"?: string,"provider"?: string,"scopes"?: (string)[],"status"?: Database["public"]['Enums']["connection_status"],"token_expires_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "connections_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"customers": {
                  Row: {
                    "created_at": string,"email": string,"hubspot_contact_id": string | null,"id": string,"name": string | null,"org_id": string,"stripe_customer_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"hubspot_contact_id"?: string | null,"id"?: string,"name"?: string | null,"org_id": string,"stripe_customer_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"hubspot_contact_id"?: string | null,"id"?: string,"name"?: string | null,"org_id"?: string,"stripe_customer_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customers_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"event_attempts": {
                  Row: {
                    "attempt_no": number,"duration_ms": number | null,"error": string | null,"event_id": string,"http_status": number | null,"id": number,"org_id": string | null,"response": Json | null,"started_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt_no": number,"duration_ms"?: number | null,"error"?: string | null,"event_id": string,"http_status"?: number | null,"id"?: never,"org_id"?: string | null,"response"?: Json | null,"started_at"?: string
                  }
                  Update: {
                    "attempt_no"?: number,"duration_ms"?: number | null,"error"?: string | null,"event_id"?: string,"http_status"?: number | null,"id"?: never,"org_id"?: string | null,"response"?: Json | null,"started_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_attempts_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_attempts_org_id_event_id_fkey"
      columns: ["org_id","event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["org_id","id"]
    },{
      foreignKeyName: "event_attempts_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "attempts": number,"created_at": string,"direction": Database["public"]['Enums']["event_direction"],"error": string | null,"external_id": string | null,"http_status": number | null,"id": string,"idempotency_key": string | null,"locked_at": string | null,"max_attempts": number,"next_attempt_at": string,"order_id": string | null,"org_id": string | null,"parent_event_id": string | null,"processed_at": string | null,"provider": string,"request": Json | null,"response": Json | null,"status": Database["public"]['Enums']["event_status"],"type": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"direction": Database["public"]['Enums']["event_direction"],"error"?: string | null,"external_id"?: string | null,"http_status"?: number | null,"id"?: string,"idempotency_key"?: string | null,"locked_at"?: string | null,"max_attempts"?: number,"next_attempt_at"?: string,"order_id"?: string | null,"org_id"?: string | null,"parent_event_id"?: string | null,"processed_at"?: string | null,"provider": string,"request"?: Json | null,"response"?: Json | null,"status"?: Database["public"]['Enums']["event_status"],"type": string,"updated_at"?: string
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"direction"?: Database["public"]['Enums']["event_direction"],"error"?: string | null,"external_id"?: string | null,"http_status"?: number | null,"id"?: string,"idempotency_key"?: string | null,"locked_at"?: string | null,"max_attempts"?: number,"next_attempt_at"?: string,"order_id"?: string | null,"org_id"?: string | null,"parent_event_id"?: string | null,"processed_at"?: string | null,"provider"?: string,"request"?: Json | null,"response"?: Json | null,"status"?: Database["public"]['Enums']["event_status"],"type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_org_id_order_id_fkey"
      columns: ["org_id","order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["org_id","id"]
    },{
      foreignKeyName: "events_org_id_parent_event_id_fkey"
      columns: ["org_id","parent_event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["org_id","id"]
    }
                  ]
                },"memberships": {
                  Row: {
                    "created_at": string,"org_id": string,"role": Database["public"]['Enums']["member_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"org_id": string,"role"?: Database["public"]['Enums']["member_role"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"org_id"?: string,"role"?: Database["public"]['Enums']["member_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "memberships_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"order_status_history": {
                  Row: {
                    "created_at": string,"event_id": string | null,"from_status": Database["public"]['Enums']["order_status"] | null,"id": number,"order_id": string,"org_id": string,"to_status": Database["public"]['Enums']["order_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event_id"?: string | null,"from_status"?: Database["public"]['Enums']["order_status"] | null,"id"?: never,"order_id": string,"org_id": string,"to_status": Database["public"]['Enums']["order_status"]
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string | null,"from_status"?: Database["public"]['Enums']["order_status"] | null,"id"?: never,"order_id"?: string,"org_id"?: string,"to_status"?: Database["public"]['Enums']["order_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_status_history_org_id_event_id_fkey"
      columns: ["org_id","event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["org_id","id"]
    },{
      foreignKeyName: "order_status_history_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_status_history_org_id_order_id_fkey"
      columns: ["org_id","order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["org_id","id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "amount_cents": number,"carrier": string | null,"created_at": string,"currency": string,"customer_id": string | null,"easypost_shipment_id": string | null,"easypost_tracker_id": string | null,"hubspot_deal_id": string | null,"id": string,"label_url": string | null,"line_items": NonNullable<Json>,"org_id": string,"shipping_address": Json | null,"source": Database["public"]['Enums']["order_source"],"status": Database["public"]['Enums']["order_status"],"status_changed_at": string,"stripe_payment_intent_id": string | null,"tracking_code": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"carrier"?: string | null,"created_at"?: string,"currency": string,"customer_id"?: string | null,"easypost_shipment_id"?: string | null,"easypost_tracker_id"?: string | null,"hubspot_deal_id"?: string | null,"id"?: string,"label_url"?: string | null,"line_items"?: NonNullable<Json>,"org_id": string,"shipping_address"?: Json | null,"source": Database["public"]['Enums']["order_source"],"status"?: Database["public"]['Enums']["order_status"],"status_changed_at"?: string,"stripe_payment_intent_id"?: string | null,"tracking_code"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "amount_cents"?: number,"carrier"?: string | null,"created_at"?: string,"currency"?: string,"customer_id"?: string | null,"easypost_shipment_id"?: string | null,"easypost_tracker_id"?: string | null,"hubspot_deal_id"?: string | null,"id"?: string,"label_url"?: string | null,"line_items"?: NonNullable<Json>,"org_id"?: string,"shipping_address"?: Json | null,"source"?: Database["public"]['Enums']["order_source"],"status"?: Database["public"]['Enums']["order_status"],"status_changed_at"?: string,"stripe_payment_intent_id"?: string | null,"tracking_code"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_org_id_customer_id_fkey"
      columns: ["org_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["org_id","id"]
    },{
      foreignKeyName: "orders_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "created_at": string,"id": string,"is_demo": boolean,"name": string,"slug": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_demo"?: boolean,"name": string,"slug": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_demo"?: boolean,"name"?: string,"slug"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "bump_usage":
{ Args: { "counter_key": string,"max_count": number,"window_size": string }; Returns: {
              "allowed": boolean,"current_count": number,"resets_at": string
            }[]
                           },
"claim_events":
{ Args: { "batch"?: number }; Returns: {
              "attempts": number,
"created_at": string,
"direction": Database["public"]['Enums']["event_direction"],
"error": string | null,
"external_id": string | null,
"http_status": number | null,
"id": string,
"idempotency_key": string | null,
"locked_at": string | null,
"max_attempts": number,
"next_attempt_at": string,
"order_id": string | null,
"org_id": string | null,
"parent_event_id": string | null,
"processed_at": string | null,
"provider": string,
"request": Json | null,
"response": Json | null,
"status": Database["public"]['Enums']["event_status"],
"type": string,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "events"
        isOneToOne: false
        isSetofReturn: true
      } },
"get_connection_secret":
{ Args: { "connection": string }; Returns: string
                           },
"heartbeat":
{ Args: { "pinger": string }; Returns: {
              "beats": number,"last_seen": string,"source": string
            }[]
                           },
"heartbeat_status":
{ Args: Record<PropertyKey, never>; Returns: {
              "beats": number,"last_seen": string,"source": string
            }[]
                           },
"oauth_state_consume":
{ Args: { "expected_provider": string,"state_hash": string }; Returns: {
              "code_verifier": string,"expired": boolean,"org_id": string,"provider": string,"user_id": string
            }[]
                           },
"oauth_state_create":
{ Args: { "code_verifier"?: string,"member": string,"org": string,"provider": string,"state_hash": string }; Returns: undefined
                           },
"set_connection_secret":
{ Args: { "connection": string,"secret": string }; Returns: undefined
                           },
"transition_order":
{ Args: { "caused_by"?: string,"new_status": Database["public"]['Enums']["order_status"],"target_order": string }; Returns: {
              "amount_cents": number,
"carrier": string | null,
"created_at": string,
"currency": string,
"customer_id": string | null,
"easypost_shipment_id": string | null,
"easypost_tracker_id": string | null,
"hubspot_deal_id": string | null,
"id": string,
"label_url": string | null,
"line_items": NonNullable<Json>,
"org_id": string,
"shipping_address": Json | null,
"source": Database["public"]['Enums']["order_source"],
"status": Database["public"]['Enums']["order_status"],
"status_changed_at": string,
"stripe_payment_intent_id": string | null,
"tracking_code": string | null,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "orders"
        isOneToOne: true
        isSetofReturn: false
      } }
          }
          Enums: {
            "ai_output_kind": "summary"|"reply_draft","connection_status": "connected"|"error"|"revoked","event_direction": "inbound"|"outbound"|"internal","event_status": "pending"|"processing"|"succeeded"|"failed"|"dead"|"ignored","member_role": "owner"|"admin"|"member","order_source": "checkout"|"simulated","order_status": "pending"|"paid"|"label_created"|"in_transit"|"out_for_delivery"|"delivered"|"exception"|"stuck"|"cancelled"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "ai_output_kind": ["summary", "reply_draft"],"connection_status": ["connected", "error", "revoked"],"event_direction": ["inbound", "outbound", "internal"],"event_status": ["pending", "processing", "succeeded", "failed", "dead", "ignored"],"member_role": ["owner", "admin", "member"],"order_source": ["checkout", "simulated"],"order_status": ["pending", "paid", "label_created", "in_transit", "out_for_delivery", "delivered", "exception", "stuck", "cancelled"]
          }
        }
} as const
