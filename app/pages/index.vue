<script setup lang="ts">
definePageMeta({ layout: false })
useSeoMeta({
  title: 'OpsHub: reliable third-party integrations',
  description: 'An order-operations dashboard wired to Stripe, EasyPost, HubSpot, Slack, Google and Claude, with every call logged, verified and retryable.',
})
</script>

<template>
  <div class="min-h-dvh bg-default">
    <UPageHero
      title="Integrations that don't fall over."
      description="OpsHub follows one order through Stripe, EasyPost, HubSpot, Slack, Google and Claude. Every webhook is verified, every call is logged, and anything that fails is retried, visibly."
    >
      <template #links>
        <div class="flex flex-wrap justify-center gap-3">
          <TryDemoButton />
          <UButton
            label="Sign in"
            to="/login"
            icon="i-lucide-log-in"
            size="xl"
            color="neutral"
            variant="subtle"
          />
          <UButton
            label="View the code"
            to="https://github.com/sanchaichie/opshub"
            target="_blank"
            icon="i-simple-icons-github"
            size="xl"
            color="neutral"
            variant="ghost"
          />
        </div>
        <p class="basis-full text-center text-sm text-muted mt-4">
          The demo is shared and resets nightly. Payments use Stripe test mode, so no real money moves.
        </p>
      </template>
    </UPageHero>
  </div>
</template>
