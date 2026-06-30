export default {
  toaster: {
    position: 'bottom-right' as const,
    expand: true,
    duration: 5000,
  },
  ui: {
    colors: {
      primary: 'violet',
      neutral: 'slate',
      pro: 'violet',
    },
    icons: {
      caution: 'caution',
      copy: 'copy',
      dark: 'dark',
      document: 'file',
      external: 'external',
      hash: 'hash',
      light: 'light',
      menu: 'menu',
      next: 'next',
      note: 'note',
      prev: 'back',
      system: 'system',
      tip: 'tip',
      warning: 'warning',
      chevronDoubleLeft: 'page-first',
      chevronDoubleRight: 'page-last',
      chevronDown: 'expand',
      chevronLeft: 'chevron-left',
      chevronRight: 'chevron-right',
      chevronUp: 'collapse',
      arrowLeft: 'back',
      arrowRight: 'next',
      check: 'check',
      close: 'close',
      ellipsis: 'more-horizontal',
      loading: 'loading',
      minus: 'minus',
      plus: 'add',
      search: 'search',
      upload: 'upload',
    },

    // Button — primary is violet solid, secondary actions use semantic neutral tokens
    // so light/dark modes both resolve correctly via --ui-* vars.
    button: {
      slots: {
        base: 'cursor-pointer disabled:cursor-not-allowed aria-disabled:cursor-not-allowed',
        item: '!py-0',
        link: 'flex flex-col items-center justify-start w-full gap-0.5 w-[90px]',
        linkLabel: 'text-xs text-toned',
        linkTrailing: 'absolute right-2 top-2',
        linkTrailingIcon: 'size-4 text-dimmed',
        // inner menu
        childList: '!grid-cols-5',
        childLink: 'flex flex-col items-center justify-start w-full gap-0.5',
        childLinkLabel: 'text-[10px] text-center text-muted',
        childLinkIcon: 'size-6 !text-primary-400',
      },
      variants: {
        variant: {
          solid: '',
          outline: 'ring-default hover:bg-elevated',
          ghost: 'hover:bg-muted',
          link: '',
        },
      },
      compoundVariants: [
        // Primary CTA — Vercel/PostHog-style inversion. bg-inverted/text-inverted
        // auto-flip per mode (dark slate on light, white on dark), so contrast
        // stays balanced without saturated brand colour fighting the surface.
        // Mode-specific shadows: light mode gets a top inner sheen ("lit from
        // above"); dark mode swaps to a hairline ring so the white button feels
        // carved instead of floating. Hover lifts 1px, press returns and scales
        // 0.99 — the 1000-small-details polish.
        // Saturated violet is reserved for `color="pro"` (purchase/upgrade only).
        {
          color: 'primary',
          variant: 'solid',
          class: 'bg-inverted text-inverted shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-[0_1px_2px_0_rgba(0,0,0,0.3),0_0_0_1px_rgba(0,0,0,0.04)] hover:bg-inverted/90 hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_2px_4px_-1px_rgba(0,0,0,0.1)] dark:hover:shadow-[0_2px_6px_-1px_rgba(0,0,0,0.4),0_0_0_1px_rgba(0,0,0,0.04)] disabled:bg-inverted/40 disabled:text-inverted/60 disabled:shadow-none aria-disabled:bg-inverted/40 aria-disabled:text-inverted/60 aria-disabled:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 transition-[background-color,box-shadow] duration-200 ease-[var(--ease-standard)]',
        },
        // Pro CTA — refined violet for purchase/upgrade moments. Same hover
        // lift + press scale as primary so the gesture vocabulary is
        // consistent; a top inner sheen and soft drop shadow give it that
        // "lit from above" Stripe/Linear quality.
        {
          color: 'pro',
          variant: 'solid',
          class: 'bg-primary-600 hover:bg-primary-500 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_1px_2px_0_rgba(0,0,0,0.12)] hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.16),0_3px_8px_-1px_rgba(0,0,0,0.18)] disabled:bg-inverted/40 disabled:text-inverted/60 disabled:shadow-none aria-disabled:bg-inverted/40 aria-disabled:text-inverted/60 aria-disabled:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 transition-[background-color,box-shadow] duration-200 ease-[var(--ease-standard)]',
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
        // Primary subtle/soft — keep monochrome. Nuxt UI's defaults pull
        // bg-primary-50 + text-primary-700 (violet); we redirect to the
        // elevated/muted semantic tokens so the surface stays neutral and
        // colour is reserved for `color="pro"`.
        {
          color: 'primary',
          variant: 'subtle',
          class: 'bg-elevated text-default ring-default hover:bg-accented disabled:bg-elevated/60 disabled:text-muted aria-disabled:bg-elevated/60 aria-disabled:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500',
        },
        {
          color: 'primary',
          variant: 'soft',
          class: 'bg-muted text-default hover:bg-accented disabled:bg-muted/60 disabled:text-muted aria-disabled:bg-muted/60 aria-disabled:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500',
        },
        {
          color: 'primary',
          variant: 'outline',
          class: 'ring-default text-default hover:bg-elevated disabled:text-muted aria-disabled:text-muted focus-visible:ring-accented',
        },
        {
          color: 'primary',
          variant: 'ghost',
          class: 'text-default hover:text-highlighted hover:bg-muted disabled:text-muted aria-disabled:text-muted',
        },
      ],
    },

    // Badge — semantic neutral tokens so soft/subtle variants flip correctly in light mode
    badge: {
      slots: {
        base: 'rounded-md',
      },
      variants: {
        size: {
          xs: 'text-[10px] px-1 py-px leading-tight',
        },
      },
      compoundVariants: [
        {
          color: 'neutral',
          variant: 'soft',
          class: 'bg-elevated text-muted',
        },
        {
          color: 'neutral',
          variant: 'subtle',
          class: 'bg-elevated/50 ring-default text-muted',
        },
        {
          color: 'neutral',
          variant: 'outline',
          class: 'ring-default text-dimmed',
        },
        {
          color: 'primary',
          variant: 'soft',
          class: 'bg-primary-500/10 text-primary-500',
        },
      ],
    },

    // Card — cards sit at the "lg" radius tier per the radius-by-elevation rule.
    // Arbitrary box-shadow syntax (rather than a `shadow-*` utility) keeps the
    // CSS variable live at runtime so .dashboard-theme can swap it for the
    // hairline ring. A regular shadow utility would inline the value at build.
    card: {
      slots: {
        root: 'rounded-lg [box-shadow:var(--elevation-raised)]',
      },
      variants: {
        variant: {
          outline: {
            root: 'bg-muted ring-default',
          },
          soft: {
            root: 'bg-muted/50',
          },
          subtle: {
            root: 'bg-muted ring-default',
          },
        },
      },
    },

    // PageCard — same structural treatment as Card
    pageCard: {
      slots: {
        root: 'rounded-lg [box-shadow:var(--elevation-raised)]',
        title: 'text-highlighted',
        description: 'text-muted',
        leadingIcon: 'text-primary-500',
      },
      variants: {
        variant: {
          outline: {
            root: 'bg-muted ring-default hover:ring-accented',
          },
          subtle: {
            root: 'bg-muted ring-default',
          },
          soft: {
            root: 'bg-muted/50',
          },
        },
      },
    },

    // Input — rounded-md per DESIGN.md radius-by-elevation (inputs tier); full-width
    // by default (the root wrapper is inline-flex otherwise, so inputs collapse to
    // content width in form grids). Semantic tokens for background and ring.
    input: {
      slots: {
        root: 'w-full',
        base: 'w-full rounded-md bg-muted placeholder:text-dimmed',
      },
      variants: {
        variant: {
          outline: 'ring-default focus-visible:ring-accented',
          subtle: 'bg-muted ring-default',
        },
      },
      compoundVariants: [
        {
          color: 'primary',
          variant: 'outline',
          class: 'focus-visible:ring-primary-500/50',
        },
      ],
    },

    // Textarea - Match input styling (full-width, rounded-md). Auto-grow
    // (field-sizing) is applied in global.css so it survives Tailwind's
    // app.config class-scanning gap.
    textarea: {
      slots: {
        root: 'w-full',
        base: 'w-full rounded-md bg-muted placeholder:text-dimmed',
      },
      variants: {
        variant: {
          outline: 'ring-default focus-visible:ring-accented',
        },
      },
    },

    // Select — match input: full-width trigger, rounded-md, semantic ring so the
    // native-style select doesn't read narrower/lighter than its sibling inputs.
    select: {
      slots: {
        base: 'w-full rounded-md',
      },
      variants: {
        variant: {
          outline: 'ring-default focus-visible:ring-accented',
        },
      },
    },

    // Separator - Subtle divider
    separator: {
      slots: {
        border: 'border-default',
      },
      variants: {
        color: {
          neutral: {
            border: 'border-default',
          },
        },
      },
    },

    // UiPageHeader - Documentation page headers
    pageHeader: {
      slots: {
        root: '',
        container: '',
        wrapper: '',
        headline: 'text-muted font-medium text-sm',
        title: 'text-3xl md:text-4xl font-semibold tracking-tight text-highlighted leading-normal',
        description: 'text-lg text-muted mt-2',
        links: 'mt-4',
      },
    },

    // PageBody - Documentation page content
    pageBody: {
      slots: {
        root: '',
      },
    },

    // ContentSurround - Prev/next navigation
    contentSurround: {
      slots: {
        root: 'grid grid-cols-2 gap-4',
        link: 'flex items-center gap-3 p-4 rounded-lg border border-default hover:border-accented hover:bg-muted/50 transition-all group',
        linkLeading: 'shrink-0',
        linkLeadingIcon: 'size-5 text-dimmed group-hover:text-primary-500 transition-colors',
        linkTitle: 'font-medium text-highlighted group-hover:text-primary-400 transition-colors',
        linkDescription: 'text-sm text-dimmed line-clamp-1',
      },
    },

    // Link — modern inline link convention. Underline is always rendered but
    // transparent by default; on hover the decoration color animates to the
    // primary tint and text lifts to highlighted. Saturated violet stays
    // reserved for CTAs/active nav (60-30-10). Apply to <ULink> usages.
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

    // Tooltip - Subtle border, adapts to light/dark
    tooltip: {
      slots: {
        content: 'bg-muted text-highlighted ring-default rounded-lg',
        arrow: 'fill-[var(--ui-bg-muted)]',
      },
    },

    // DropdownMenu — tooltip-grade chrome (5-layer shadow + inset edges) plus
    // outline-ring hover on items and a left accent bar on the active item.
    // Style only; behaviour stays default Nuxt UI v4 / Reka.
    dropdownMenu: {
      slots: {
        content: 'ui-popover-content',
        item: 'ui-dropdown-item rounded-md transition-colors items-center',
        itemLeadingIcon: 'ui-dropdown-lead-icon !size-3 text-dimmed group-data-highlighted:!text-default',
        itemLabel: 'tracking-[-0.005em]',
        itemTrailingKbds: 'gap-0.5',
        itemTrailingKbd: 'font-mono text-[10px] bg-muted rounded-sm px-1 py-px',
        separator: 'ui-dropdown-separator mx-2 border-default',
      },
    },

    // Popover — same chrome treatment as dropdown/tooltip.
    popover: {
      slots: {
        content: 'ui-popover-content',
      },
    },

    // ContextMenu — match dropdown chrome.
    contextMenu: {
      slots: {
        content: 'ui-popover-content',
        item: 'ui-dropdown-item rounded-md transition-colors items-center',
        itemLeadingIcon: 'ui-dropdown-lead-icon !size-3 text-dimmed',
      },
    },

    // Avatar - Subtle border
    avatar: {
      slots: {
        root: 'ring-default',
      },
    },

    // NavigationMenu - Semantic tokens so light/dark both work
    navigationMenu: {
      slots: {
        item: '!py-0',
        link: 'flex flex-col items-center justify-start w-full gap-0.5 w-[90px]',
        linkLabel: 'text-xs text-muted',
        linkTrailing: 'absolute right-2 top-2',
        linkTrailingIcon: 'size-4 text-dimmed',
        childList: '!grid-cols-5',
        childLink: 'flex flex-col items-center justify-start w-full gap-0.5',
        childLinkLabel: 'text-[10px] text-center text-dimmed',
        childLinkIcon: 'size-6 !text-primary-400',
      },
      variants: {
        active: {
          false: {
            linkLeadingIcon: 'text-muted',
          },
          true: {
            link: 'text-primary-500',
          },
        },
      },
    },

    // Accordion - Semantic tokens for light/dark parity
    accordion: {
      slots: {
        root: 'border-default',
        item: 'border-default',
        trigger: 'text-highlighted hover:bg-muted',
        content: 'text-muted',
      },
    },

    // Drawer - Semantic tokens for light/dark parity
    drawer: {
      slots: {
        content: 'bg-default ring-default',
        handle: 'bg-accented',
      },
    },

    // Tabs - Neutral white active to sit quietly below the sidebar's primary nav.
    // Primary violet is reserved for CTAs; tabs are sub-navigation and should read
    // as text-level emphasis with a thin white underline.
    tabs: {
      slots: {
        trigger: 'text-muted',
        indicator: 'rounded-full',
      },
      compoundVariants: [
        {
          variant: 'link',
          class: {
            trigger: 'data-[state=active]:text-highlighted',
            indicator: 'bg-inverted',
          },
        },
      ],
    },

    // Form elements
    formField: {
      slots: {
        label: 'text-toned',
        description: 'text-dimmed',
        error: 'text-error',
      },
    },

    // Checkbox - Primary color when checked
    checkbox: {
      slots: {
        base: 'border-accented data-[state=checked]:bg-primary-500 data-[state=checked]:border-primary-500',
      },
    },

    // SelectMenu - Dropdown with semantic tokens + overlay chrome
    selectMenu: {
      slots: {
        content: 'bg-muted ring-default ui-popover-content',
        item: 'ui-dropdown-item rounded-md text-toned data-[highlighted]:text-highlighted',
        itemLeadingIcon: 'ui-dropdown-lead-icon !size-3 text-dimmed',
      },
    },
    contentNavigation: {
      slots: {
        list: 'space-y-2',
        listWithChildren: 'border-none transform mb-5',
      },
      variants: {
        active: {
          true: {
            link: 'text-toned after:-left-[1px] font-semibold rounded-[10px] after:rounded-[10px] after:w-full after:h-full after:absolute after:bottom-0 after:block after:bg-elevated/50 after:shadow-xs',
          },
          false: {
            link: 'text-toned',
            linkLeadingIcon: 'text-dimmed',
          },
        },
      },
      compoundVariants: [
        {
          color: 'primary',
          variant: 'pill',
          active: true,
          class: {
            link: 'text-highlighted ',
          },
        },
      ],
    },
    prose: {
      codeIcon: {
        'robots.txt': 'vscode-icons:file-type-robots',
        'txt': 'vscode-icons:file-type-text',
      },
      a: {
        base: [
          'relative border-none underline underline-offset-4 text-default decoration-transition-all decoration-opacity-70 decoration-[0.1rem] decoration-[var(--ui-text-dimmed)]',
          // set a :after border under the link
          'transition-all',
          'hover:text-dimmed decoration-opacity-100 hover:underline-offset-1 hover:decoration-[0.1rem]',
        ],
      },
    },
  },
}
