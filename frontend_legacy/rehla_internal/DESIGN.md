---
name: Rehla Internal
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#20201f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353535'
  on-surface: '#e5e2e1'
  on-surface-variant: '#cfc4c5'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#988e90'
  outline-variant: '#4c4546'
  surface-tint: '#c6c6c6'
  primary: '#c6c6c6'
  on-primary: '#303030'
  primary-container: '#000000'
  on-primary-container: '#757575'
  inverse-primary: '#5e5e5e'
  secondary: '#c6c6c7'
  on-secondary: '#2f3131'
  secondary-container: '#454747'
  on-secondary-container: '#b4b5b5'
  tertiary: '#c6c6c6'
  on-tertiary: '#303030'
  tertiary-container: '#000000'
  on-tertiary-container: '#757575'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e2e2e2'
  primary-fixed-dim: '#c6c6c6'
  on-primary-fixed: '#1b1b1b'
  on-primary-fixed-variant: '#474747'
  secondary-fixed: '#e2e2e2'
  secondary-fixed-dim: '#c6c6c7'
  on-secondary-fixed: '#1a1c1c'
  on-secondary-fixed-variant: '#454747'
  tertiary-fixed: '#e2e2e2'
  tertiary-fixed-dim: '#c6c6c6'
  on-tertiary-fixed: '#1b1b1b'
  on-tertiary-fixed-variant: '#474747'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353535'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '800'
    lineHeight: '1.1'
    letterSpacing: -0.04em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.4'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.5'
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.05em
spacing:
  base: 8px
  container-margin: 24px
  gutter: 16px
  sidebar-width: 280px
  touch-target: 44px
---

## Brand & Style
The design system reflects the raw, high-contrast aesthetic of Egyptian streetwear. It is built for operational speed and executive clarity, utilizing a **Minimalist-Brutalist** hybrid style. The UI prioritizes high-impact legibility and functional density, stripping away unnecessary ornamentation to focus on the movement of inventory and capital.

The experience is split into two distinct modes: **Operational Dark** for high-focus environments like warehouses and POS, and **Management Light** for data-heavy analytics and financial reporting. The aesthetic evokes a premium, industrial feel—mirroring the quality of the garments while maintaining the utilitarian nature of a logistics engine.

## Colors
This design system employs a strict high-contrast palette. 

- **Operational Mode (Dark):** Uses a true black (`#000000`) foundation. Surfaces are defined by thin, subtle gray borders (`#1A1A1A`) rather than shadows.
- **Management Mode (Light):** Uses a crisp white (`#FFFFFF`) foundation with light gray accents (`#F5F5F5`) for secondary containers.
- **Functional Accents:** Vibrant, high-saturation colors are used exclusively for status indicators (Paid, Overdue, Low Stock) to ensure they "pop" against the monochromatic base.

## Typography
The typography strategy distinguishes between **Narrative/Direction** and **Data/Logistics**. 

- **Inter** is the workhorse for all UI labels, headings, and body copy. Bold weights are used aggressively for hierarchy.
- **JetBrains Mono** is utilized for all financial figures, SKU numbers, and quantities. Monospaced characters ensure that columns of numbers align perfectly in tables and invoices, critical for rapid financial auditing.
- **Egyptian Context:** While the UI is English, line-heights are generous to accommodate potential RTL (Arabic) toggle without layout breakage.

## Layout & Spacing
The layout follows a **Fixed-Fluid hybrid grid**. 

- **Desktop:** Features a persistent left-hand sidebar (`280px`) for primary navigation. Content lives in a fluid container with a maximum width of `1440px` for management dashboards.
- **Mobile/Tablet:** Navigation shifts to a high-contrast bottom tab bar for "thumb-driven" operational speed.
- **Grid:** A 12-column grid is used for the Management Dashboard, while the Warehouse/POS views use a simplified 2-column "Scanning" layout to maximize visibility of line items.
- **RTL Readiness:** All margins and paddings are defined using logical properties (e.g., `padding-inline-start`) to ensure seamless transition to Arabic if required.

## Elevation & Depth
In keeping with the streetwear aesthetic, this design system rejects soft shadows. 

- **Tonal Separation:** Depth is achieved through "Layering by Border." A container on top of the background is defined by a `1px` solid border (`#1A1A1A` in dark mode, `#E5E5E5` in light mode).
- **Z-Index:** High-priority elements like Modals or Pop-overs use a solid `4px` offset "hard shadow" (black in light mode, white in dark mode) to create a physical, sticker-like appearance common in streetwear branding.
- **Glassmorphism:** Reserved strictly for mobile navigation bars to maintain context of the scrollable content beneath.

## Shapes
The shape language is **Sharp (0px)**. 

Sharp edges communicate precision, speed, and an industrial "operational" feel. There are no rounded corners on buttons, input fields, or cards. This reinforces the high-contrast, brutalist aesthetic and differentiates the internal system from softer consumer-facing apps.

## Components
- **Buttons:** Primary buttons are solid blocks of the inverse theme color (White on Black for Dark mode). Secondary buttons use a `1px` stroke. Hover states involve a full color invert.
- **Status Badges:** Small, rectangular tags with monochromatic text on a high-saturation background. (e.g., "PAID" is black text on a `#00FF66` block).
- **Input Fields:** Bottom-border only for a minimal look, or full `1px` box. Labels are always `label-sm` (uppercase).
- **Monetary Values:** Displayed as `EGP 0,000.00` using **JetBrains Mono**.
- **Integration Indicators:** 
    - **Shopify:** Small "S" icon in brand purple (#96BF48) next to Order IDs.
    - **Bosta:** Tracking numbers styled as clickable blue links with a "truck" glyph for quick delivery status checks.
- **Data Tables:** High-density, no vertical lines, only horizontal separators. Row hover effect uses a subtle gray shift.