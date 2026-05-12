export default defineAppConfig({
  ui: {
    colors: {
      primary: 'cyan',
      secondary: 'blue',
      success: 'green',
      warning: 'amber',
      error: 'red',
      info: 'sky',
      neutral: 'slate',
    },
    button: {
      defaultVariants: { color: 'primary', variant: 'solid' },
      slots: { base: 'transition-all duration-200' },
      compoundVariants: [
        { color: 'primary', variant: 'solid', class: 'hover:shadow-[0_0_24px_rgba(34,211,238,0.35)]' },
        { color: 'neutral', variant: 'outline', class: 'bg-white/[0.04] border-white/15 hover:bg-white/[0.07] hover:border-white/20' },
      ],
    },
    card: {
      slots: {
        root: 'backdrop-blur-xl bg-white/[0.04] border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.35)]',
      },
      variants: {
        variant: {
          outline: { root: 'bg-white/[0.04] ring-0 border border-white/[0.08] backdrop-blur-xl' },
          soft: { root: 'bg-white/[0.025] border border-white/[0.06] backdrop-blur-lg' },
        },
      },
    },
    modal: {
      slots: {
        overlay: 'bg-black/60 backdrop-blur-sm',
        content: 'backdrop-blur-2xl bg-white/[0.05] border border-white/10 shadow-2xl',
      },
    },
    tabs: {
      slots: { list: 'bg-white/[0.04] backdrop-blur-md border border-white/[0.08]' },
      variants: { variant: { pill: { indicator: 'bg-white/10 backdrop-blur-sm' } } },
    },
    input: {
      slots: { base: 'backdrop-blur-md bg-white/[0.04] border-white/10 focus:border-primary/50' },
    },
    badge: {
      defaultVariants: { variant: 'soft' },
    },
  },
})
