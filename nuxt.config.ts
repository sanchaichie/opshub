// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/ui', '@nuxtjs/supabase'],

  devtools: { enabled: true },

  css: ['~/assets/css/main.css'],

  // Secrets live in the private part of runtimeConfig and are only readable on
  // the server. Each value is overridden at runtime by its NUXT_* env var
  // (e.g. NUXT_CRON_SECRET), so nothing secret is ever baked into the bundle.
  runtimeConfig: {
    // Vercel Cron sends CRON_SECRET as a Bearer token; read it under that name
    // too so the same secret isn't configured twice.
    cronSecret: process.env.CRON_SECRET ?? '',
    public: {
      siteUrl: 'http://localhost:3000',
    },
  },

  compatibilityDate: '2025-07-15',

  typescript: {
    strict: true,
  },

  eslint: {
    config: {
      stylistic: true,
    },
  },

  supabase: {
    types: '~~/shared/types/database.types.ts',
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      // Public pages and server routes handle their own auth.
      exclude: ['/', '/api/**'],
    },
  },
})
