import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'

type Table = 'events' | 'orders'

/**
 * Calls `onChange` whenever a row of `table` in the current org is inserted
 * or updated. Supabase Realtime applies RLS, so a browser only ever receives
 * its own org's rows; the org filter just narrows the stream further.
 */
export function useRealtime(table: Table, orgId: Ref<string | null>, onChange: () => void) {
  const supabase = useSupabaseClient<Database>()
  const connected = ref(false)
  let channel: RealtimeChannel | null = null

  function unsubscribe() {
    if (channel) supabase.removeChannel(channel)
    channel = null
    connected.value = false
  }

  watch(orgId, (id) => {
    unsubscribe()
    if (!id || import.meta.server) return

    channel = supabase
      .channel(`${table}:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, filter: `org_id=eq.${id}` }, onChange)
      .subscribe((status) => {
        connected.value = status === 'SUBSCRIBED'
      })
  }, { immediate: true })

  onBeforeUnmount(unsubscribe)
  return { connected }
}
