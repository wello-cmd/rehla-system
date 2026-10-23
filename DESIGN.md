---
name: Rehla Dispatch Desk
description: Clear commerce operations and executive reporting.
colors:
  primary: "#b84013"
  primary-hover: "#96340f"
  ivory: "#f4f2ed"
  surface: "#ffffff"
  ink: "#17252a"
  muted: "#596568"
  seam: "#ddded8"
  success: "#22735a"
  warning: "#956307"
  error: "#b32f38"
  dark-bg: "#101a1e"
  dark-surface: "#1a282d"
  dark-text: "#f3f1eb"
  dark-muted: "#b2bdbf"
  dark-seam: "#35454a"
  dark-accent: "#ff986a"
typography:
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.35
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  sm: "5px"
  md: "8px"
  lg: "10px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  panel: "20px"
  section: "24px"
components:
  button-primary:
    background: "{colors.primary}"
    color: "#ffffff"
    borderRadius: "{rounded.sm}"
  card:
    background: "{colors.surface}"
    borderRadius: "{rounded.md}"
---

# Design System: Rehla Dispatch Desk

## Overview

**Creative North Star: "Dispatch Desk"**

The user selected the warm ivory and ink dashboard mockup on 20 October 2026. Rehla serves both daily operations and executive reporting. The interface uses precise alignment, readable data and clear orange actions. It remains an operating tool, with no paper textures or ornamental effects.

**Key Characteristics:** persistent ink navigation, warm working surfaces, compact tables, strong financial hierarchy, labeled delivery states, light and dark themes.

## Colors

### Primary

Burnt orange marks primary actions and the selected destination. Dark mode uses a brighter accent for text links while keeping white-on-orange primary buttons.

### Neutral

Ivory is the light working field; white surfaces sit over it with fine seams. Ink navigation stays dark in both themes. Secondary text uses the muted palette for legibility. Dark content uses the dark background, surface, text and seam tokens.

### Named Rules

**The Destination Rule.** Preserve an obvious selected navigation destination.
**The State Rule.** Status color always accompanies a readable label.

## Typography

Inter supplies headings and UI copy. JetBrains Mono is reserved for identifiers and data where useful. Financial values use tabular numerals. Main headings reduce to 26px on phones; metric values vary from 17–25px at wide widths and 22–24px at narrower widths. Table body text is 13px and headers 12px. Chart legend text uses neutral foreground, with color carried by markers.

## Layout

A fixed 240px ink sidebar accompanies the fluid main workspace with 24px horizontal padding. Workspace breadcrumb precedes the page title and actions. Summary metrics use six columns, three below 1200px and two on phones. Dashboard main panels use a roughly 1.8:1 split and stack below 1000px. Below 769px, navigation becomes a focus-managed drawer; data tables scroll inside their container. Login uses an ink introduction and a focused sign-in form; on phones the wordmark header retains intrinsic height.

## Elevation & Depth

Panels are flat with fine seams. Shadows distinguish floating date controls and dialogs, rather than decorating every card. Focus uses a visible outline. Reduced motion removes drawer and control transitions and loading rotation.

## Shapes

Panels have 8px corners, ordinary controls 5px. Avatars are circular. Status tags have compact 4px corners. Avoid excessive pill shapes.

## Components

### Buttons

Primary actions use orange with white text; hover deepens the orange. Secondary buttons use a surface and visible border. Ghost buttons remain quiet. Standard controls are at least 40px high and main form actions 44px. Preserve keyboard focus and disabled state.

### Cards / Containers

20px panel padding, 18px on phones. Panels use one fine seam and no resting decorative shadow. Loading, error and empty states retain the panel's purpose.

### Inputs / Fields

Visible labels, surface backgrounds and seam borders. Focus uses an accent border and ring. Login errors remain inline with an alert role. Password visibility remains a labeled independent control.

### Navigation

Ink background, warm-white wordmark, grouped links, orange active destination, visible hover and keyboard focus. Drawer supports Escape, focus containment and restoration. Footer contains theme toggle, profile, sign out and API reachability.

### Business Summary

Six aligned metrics separated by fine rules, preserving live values, unavailable states and date-scope notes. Do not invent growth comparisons.

## Do's and Don'ts

- **Do** retain saved theme choices; new sessions default to light.
- **Do** keep essential table columns accessible on phones.
- **Do** distinguish Shopify orders handed to Bosta from separate Rehla in-house delivery, which is not linked to Shopify yet.
- **Don't** count delivery providers as additional sales channels.
- **Don't** ship illustrative mockup figures, fabricated growth comparisons or placeholder product photos.
- **Don't** present configured integrations as verified healthy credentials.

## Arabic interface

English and Arabic share Dispatch Desk. Keep the chosen language across sessions, mirror navigation and spacing in RTL, use a legible Arabic system font, and keep identifiers, email and numeric entry isolated LTR. Switching language preserves current work. Translate UI labels only; business records and API codes remain unchanged. See `docs/I18N.md` for the scope of exports and provider-message fallbacks.
