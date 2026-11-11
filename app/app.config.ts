export default defineAppConfig({
  ui: {
    pageCard: {
      slots: {
        // Nuxt UI's default (items-start) sizes card content to its natural
        // width, so long rows and ids pushed cards past the screen on phones.
        // Stretch content to the card instead, and let it shrink.
        wrapper: 'items-stretch min-w-0',
        container: 'min-w-0',
      },
    },
  },
})
