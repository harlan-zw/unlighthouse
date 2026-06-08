<script setup lang="ts">
</script>

<template>
  <div class="space-y-10">
    <KitHeader
      eyebrow="Components"
      title="Buttons"
      description="One button primitive — UiButton. A single `purpose` prop sets intent and styling. No raw color or variant: severity belongs to the surrounding Alert/Banner, not the button."
    />

    <KitSection
      title="Purpose"
      description="purpose describes the role of the action, not a colour. cta = the primary commit; secondary = an alternative action; quiet = low-emphasis (icons, nav, alerts); danger = destructive intent."
      code="<UiButton purpose=…>"
    >
      <KitRow label="cta">
        <UiButton purpose="cta">
          Add site
        </UiButton>
        <UiButton purpose="cta" icon="rocket">
          Launch
        </UiButton>
        <UiButton purpose="cta" trailing-icon="next">
          Continue
        </UiButton>
      </KitRow>
      <KitRow label="secondary">
        <UiButton purpose="secondary">
          Connect
        </UiButton>
        <UiButton purpose="secondary" icon="add">
          Add
        </UiButton>
      </KitRow>
      <KitRow label="quiet">
        <UiButton purpose="quiet">
          Back
        </UiButton>
        <UiButton purpose="quiet" icon="refresh" aria-label="Refresh" />
        <UiButton purpose="quiet" icon="more" aria-label="More options" />
      </KitRow>
      <KitRow label="danger">
        <UiButton purpose="danger">
          Delete account
        </UiButton>
        <UiButton purpose="danger" icon="delete" aria-label="Delete" />
      </KitRow>
    </KitSection>

    <KitSection title="Sizes" code="size=xs|sm|md|lg|xl">
      <KitRow label="size">
        <UiButton purpose="cta" size="xs">
          xs
        </UiButton>
        <UiButton purpose="cta" size="sm">
          sm
        </UiButton>
        <UiButton purpose="cta" size="md">
          md
        </UiButton>
        <UiButton purpose="cta" size="lg">
          lg
        </UiButton>
        <UiButton purpose="cta" size="xl">
          xl
        </UiButton>
      </KitRow>
    </KitSection>

    <KitSection
      title="State"
      description="loading and disabled forward to the underlying button. Motion FX suspends while disabled or loading."
      code="loading / disabled"
    >
      <KitRow label="state">
        <UiButton purpose="cta" size="sm" loading>
          Saving…
        </UiButton>
        <UiButton purpose="cta" size="sm" disabled>
          Disabled
        </UiButton>
        <UiButton purpose="secondary" size="sm" disabled>
          Disabled
        </UiButton>
      </KitRow>
    </KitSection>

    <KitSection
      title="Motion"
      description="UiButton wraps the button in motion-v: hover lift, press settle, cursor-tracked spotlight, and a specular sweep on cta. Intensity is auto-derived from purpose + size — cta at lg/xl gets the full sweep. No rotation, no sound, no randomisation."
      code="auto from purpose"
    >
      <KitRow label="intensity by purpose">
        <UiButton purpose="quiet" size="sm">
          quiet → subtle
        </UiButton>
        <UiButton purpose="secondary" size="sm">
          secondary → default
        </UiButton>
        <UiButton purpose="cta" size="lg">
          cta lg → full sweep
        </UiButton>
      </KitRow>
    </KitSection>
  </div>
</template>
