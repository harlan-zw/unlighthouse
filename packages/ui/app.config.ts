export default defineAppConfig({
  ui: {
    colors: {
      primary: 'stone',
      secondary: 'stone',
      success: 'green',
      warning: 'amber',
      error: 'red',
      info: 'sky',
      neutral: 'stone',
    },

    // Primary CTA — Vercel/Linear inversion. bg-inverted/text-inverted resolves
    // to near-white on dark; lift on hover, scale 0.99 on press. Saturated brand
    // colour is intentionally absent from chrome.
    button: {
      defaultVariants: { color: 'primary', variant: 'solid' },
      slots: {
        base: 'cursor-pointer disabled:cursor-not-allowed aria-disabled:cursor-not-allowed transition-[background-color,box-shadow,transform] duration-200',
      },
      compoundVariants: [
        {
          color: 'primary',
          variant: 'solid',
          class: 'bg-inverted text-inverted hover:bg-inverted/90 hover:-translate-y-px active:translate-y-0 active:scale-[0.99] shadow-[0_1px_2px_0_rgba(0,0,0,0.3),0_0_0_1px_rgba(0,0,0,0.04)] hover:shadow-[0_2px_6px_-1px_rgba(0,0,0,0.4),0_0_0_1px_rgba(0,0,0,0.04)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accented',
        },
        {
          color: 'neutral',
          variant: 'outline',
          class: 'ring-default text-toned hover:bg-elevated focus-visible:ring-accented',
        },
        {
          color: 'neutral',
          variant: 'ghost',
          class: 'text-muted hover:text-highlighted hover:bg-muted',
        },
      ],
    },

    // Card — flat surfaces, no backdrop blur, hairline ring instead of drop shadow.
    card: {
      slots: {
        root: 'rounded-sm bg-elevated/40 ring-1 ring-default',
      },
      variants: {
        variant: {
          outline: { root: 'bg-elevated/40 ring-1 ring-default' },
          soft: { root: 'bg-elevated/20 ring-1 ring-muted' },
          subtle: { root: 'bg-elevated/40 ring-1 ring-default' },
        },
      },
    },

    modal: {
      slots: {
        overlay: 'bg-black/60',
        content: 'bg-elevated ring-1 ring-default rounded-sm ui-popover-content',
      },
    },

    // Tabs — pill-only for view-mode toggles. Indicator is bg-accented (quiet).
    tabs: {
      slots: {
        list: 'bg-elevated/60 ring-1 ring-default',
        trigger: 'text-muted data-[state=active]:text-highlighted',
        indicator: 'rounded-md',
      },
      variants: {
        variant: {
          pill: { indicator: 'bg-accented' },
        },
      },
    },

    input: {
      slots: { base: 'rounded-sm bg-elevated/60 ring-1 ring-default placeholder:text-dimmed focus-visible:ring-accented' },
    },

    textarea: {
      slots: { base: 'rounded-sm bg-elevated/60 ring-1 ring-default placeholder:text-dimmed focus-visible:ring-accented' },
    },

    badge: {
      defaultVariants: { variant: 'soft' },
      slots: { base: 'rounded-md' },
      compoundVariants: [
        { color: 'neutral', variant: 'soft', class: 'bg-elevated text-muted' },
        { color: 'neutral', variant: 'subtle', class: 'bg-elevated/50 ring-1 ring-default text-muted' },
        { color: 'neutral', variant: 'outline', class: 'ring-1 ring-default text-dimmed' },
      ],
    },

    // Tooltip — tooltip-grade chrome via .ui-popover-content (5-layer shadow + inset edges).
    tooltip: {
      slots: {
        content: 'ui-popover-content bg-elevated text-highlighted ring-1 ring-default rounded-sm',
      },
    },

    // Popover — same chrome treatment as tooltip.
    popover: {
      slots: {
        content: 'ui-popover-content bg-elevated ring-1 ring-default rounded-sm',
      },
    },

    // DropdownMenu — tooltip-grade chrome + outline-ring hover + left accent bar on active.
    dropdownMenu: {
      slots: {
        content: 'ui-popover-content bg-elevated ring-1 ring-default rounded-sm',
        item: 'ui-dropdown-item rounded-md transition-colors',
        itemLeadingIcon: '!size-3.5 text-dimmed group-data-highlighted:!text-highlighted',
        itemLabel: 'tracking-[-0.005em]',
        itemTrailingKbds: 'gap-0.5',
        itemTrailingKbd: 'font-mono text-[10px] bg-muted rounded-sm px-1 py-px',
        separator: 'ui-dropdown-separator mx-2 border-default',
      },
    },

    contextMenu: {
      slots: {
        content: 'ui-popover-content bg-elevated ring-1 ring-default rounded-sm',
        item: 'ui-dropdown-item rounded-md transition-colors',
        itemLeadingIcon: '!size-3.5 text-dimmed',
      },
    },

    selectMenu: {
      slots: {
        content: 'ui-popover-content bg-elevated ring-1 ring-default rounded-sm',
        item: 'ui-dropdown-item rounded-md text-toned data-[highlighted]:text-highlighted',
        itemLeadingIcon: '!size-3.5 text-dimmed',
      },
    },

    avatar: {
      slots: {
        root: 'ring-1 ring-default',
      },
    },

    separator: {
      slots: {
        border: 'border-default',
      },
    },

    formField: {
      slots: {
        label: 'text-toned',
        description: 'text-dimmed',
        error: 'text-error',
      },
    },

    // Link — modern inline convention. Underline rendered but transparent by
    // default; on hover it animates to primary tint and text lifts to highlighted.
    link: {
      base: 'underline underline-offset-4 decoration-1 decoration-transparent hover:decoration-[var(--ui-color-primary-500)] focus-visible:outline-primary transition-[color,text-decoration-color] duration-200',
      variants: {
        active: {
          true: 'text-primary decoration-[var(--ui-color-primary-500)]',
          false: 'text-default',
        },
        disabled: {
          true: 'cursor-not-allowed opacity-75',
        },
      },
      compoundVariants: [
        {
          active: false,
          disabled: false,
          class: 'hover:text-highlighted',
        },
      ],
    },

    // Checkbox — primary fill when checked.
    checkbox: {
      slots: {
        base: 'border-accented data-[state=checked]:bg-primary-500 data-[state=checked]:border-primary-500',
      },
    },

    // Accordion — semantic tokens for hairline borders and hover surface.
    accordion: {
      slots: {
        root: 'border-default',
        item: 'border-default',
        trigger: 'text-highlighted hover:bg-muted',
        content: 'text-muted',
      },
    },

    // Drawer — semantic tokens for surface + handle.
    drawer: {
      slots: {
        content: 'bg-default ring-default',
        handle: 'bg-accented',
      },
    },

    // NavigationMenu — semantic tokens, primary tint for active.
    navigationMenu: {
      slots: {
        item: '!py-0',
        linkLabel: 'text-xs text-muted',
        linkTrailingIcon: 'size-4 text-dimmed',
      },
      variants: {
        active: {
          false: { linkLeadingIcon: 'text-muted' },
          true: { link: 'text-primary-500' },
        },
      },
    },
  },
})
