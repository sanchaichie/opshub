<script setup lang="ts">
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'

definePageMeta({ layout: false })
useSeoMeta({ title: 'Sign in · OpsHub' })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const toast = useToast()
const siteUrl = useRuntimeConfig().public.siteUrl

const mode = ref<'signin' | 'signup'>('signin')
const loading = ref(false)

// Already signed in (e.g. back button): skip the form.
watchEffect(() => {
  if (user.value) navigateTo('/dashboard')
})

const fields: AuthFormField[] = [
  { name: 'email', type: 'email', label: 'Email', placeholder: 'you@company.com', required: true },
  { name: 'password', type: 'password', label: 'Password', placeholder: 'At least 8 characters', required: true },
]

const schema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
})
type Credentials = z.output<typeof schema>

const providers = [{
  label: 'Continue with Google',
  icon: 'i-simple-icons-google',
  color: 'neutral' as const,
  variant: 'subtle' as const,
  onClick: signInWithGoogle,
}]

async function onSubmit({ data }: FormSubmitEvent<Credentials>) {
  loading.value = true
  try {
    const { error, data: result } = mode.value === 'signin'
      ? await supabase.auth.signInWithPassword(data)
      : await supabase.auth.signUp({ ...data, options: { emailRedirectTo: `${siteUrl}/confirm` } })
    if (error) throw error

    if (mode.value === 'signup' && !result.session) {
      toast.add({ title: 'Check your inbox', description: 'We sent you a link to confirm your email.', color: 'success' })
      return
    }
    await navigateTo('/dashboard')
  }
  catch (error) {
    toast.add({ title: mode.value === 'signin' ? 'Sign-in failed' : 'Sign-up failed', description: (error as Error).message, color: 'error' })
  }
  finally {
    loading.value = false
  }
}

async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${siteUrl}/confirm` },
  })
  if (error) toast.add({ title: 'Google sign-in is unavailable', description: error.message, color: 'error' })
}
</script>

<template>
  <div class="min-h-dvh flex items-center justify-center px-4 py-12 bg-default">
    <UPageCard class="w-full max-w-md">
      <UAuthForm
        :schema="schema"
        :fields="fields"
        :providers="providers"
        :loading="loading"
        :title="mode === 'signin' ? 'Sign in to OpsHub' : 'Create your OpsHub account'"
        icon="i-lucide-workflow"
        :submit="{ label: mode === 'signin' ? 'Sign in' : 'Create account', block: true }"
        @submit="onSubmit"
      >
        <template #description>
          <template v-if="mode === 'signin'">
            New here?
            <ULink
              as="button"
              class="text-primary font-medium"
              @click="mode = 'signup'"
            >Create an account</ULink>
          </template>
          <template v-else>
            Already have an account?
            <ULink
              as="button"
              class="text-primary font-medium"
              @click="mode = 'signin'"
            >Sign in</ULink>
          </template>
        </template>

        <template #footer>
          Just looking? <ULink
            to="/"
            class="text-primary font-medium"
          >Try the demo</ULink> instead.
        </template>
      </UAuthForm>
    </UPageCard>
  </div>
</template>
