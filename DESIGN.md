---
name: "Physio Note Finisher"
description: "Quiet Utility for fast, dependable physiotherapy documentation."
colors:
  primary: "#3F527A"
  primary-soft: "#E8ECF6"
  background: "#F6F4EF"
  surface: "#FBFAF7"
  surface-muted: "#EEEDE8"
  text: "#1D2734"
  text-subtle: "#657080"
  border: "#D9DCD8"
  success: "#2F6B55"
  success-soft: "#E6F0E9"
  warning: "#806320"
  warning-soft: "#F7EED7"
  destructive: "#A33C36"
  error-surface: "#FAECEA"
  error-border: "#E8CAC6"
  dev-banner-surface: "#EEEAF5"
  dev-banner-text: "#3F527A"
typography:
  display:
    fontFamily: "Manrope_600SemiBold"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: "33.6px"
    letterSpacing: "0"
  heading:
    fontFamily: "Manrope_600SemiBold"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "24px"
    letterSpacing: "0"
  body:
    fontFamily: "PublicSans_400Regular"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
    letterSpacing: "0"
  label:
    fontFamily: "PublicSans_600SemiBold"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: "19.6px"
    letterSpacing: "0"
rounded:
  chip: "999px"
  control: "12px"
  card: "12px"
  dock: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
  3xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 24px"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 24px"
    height: "48px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 24px"
    height: "48px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "48px"
  filter-chip-selected:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    padding: "0 16px"
    height: "44px"
  bottom-navigation-active:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "6px"
---

# Design System: Physio Note Finisher

## Overview

**Creative North Star: "Quiet Utility"**

Physio Note Finisher is a mobile work tool for clinicians moving quickly between patients, appointments, and documentation. It uses warm paper-like surfaces, dark slate text, and a restrained indigo action colour to make the next useful action clear without competing with clinical context.

The system is calm and dependable, not decorative. It relies on information order, concise copy, flat boundaries, and predictable controls. A clinician may use the app in a bright clinic room, standing between visits, and needs to scan and act without visual translation.

**Key Characteristics:**

- Restrained colour, with indigo reserved for primary actions and active selections.
- Flat lists and one-pixel dividers instead of stacked cards or decorative elevation.
- One clear screen title, meaningful work groupings, and progressive disclosure for secondary controls.
- Clinical status always paired with readable text.
- Android-first, one-handed controls with durable automated-test identifiers.

## Colors

The palette is warm and low-noise. Paper-toned neutrals carry the workspace, slate ink carries information, and indigo directs action. Semantic colours communicate state only.

### Primary

- **Measured Indigo** (`#3F527A`): primary actions, focused input borders, active navigation text, and selected control content.
- **Soft Indigo** (`#E8ECF6`): selected control and active navigation backing.

### Neutral

- **Paper Canvas** (`#F6F4EF`): screen background.
- **Raised Paper** (`#FBFAF7`): inputs and raised surfaces.
- **Tonal Paper** (`#EEEDE8`): grouped task surfaces and unselected filter treatment.
- **Slate Ink** (`#1D2734`): headings and primary body text.
- **Quiet Slate** (`#657080`): supporting metadata and placeholder text.
- **Soft Divider** (`#D9DCD8`): one-pixel list and navigation boundaries.

### Semantic

- **Confirmed Green** (`#2F6B55`) with **Soft Green** (`#E6F0E9`): saved and finalized states.
- **Attention Ochre** (`#806320`) with **Soft Ochre** (`#F7EED7`): unfinished work and warnings.
- **Clinical Red** (`#A33C36`) with **Error Paper** (`#FAECEA`) and **Error Border** (`#E8CAC6`): destructive and recoverable error states.

**The Clinical Meaning Rule.** Semantic colour never carries meaning alone. Pair every status and error colour with a short, readable label.

**The One Action Colour Rule.** Use Measured Indigo for primary action, current selection, and focus. Do not spend it on decoration.

## Typography

**Display Font:** Manrope SemiBold (`Manrope_600SemiBold`)
**Body Font:** Public Sans (`PublicSans_400Regular`)
**Label Font:** Public Sans SemiBold (`PublicSans_600SemiBold`)

The type system is practical and calm. Manrope marks screen-level hierarchy, while Public Sans keeps rows, metadata, and control labels easy to read at phone scale.

### Hierarchy

- **Display** (600, 28px, 33.6px): prominent screen-level moments when stronger hierarchy is needed.
- **Heading** (600, 20px, 24px): screen titles and meaningful section headings.
- **Body** (400, 16px, 24px): patient names, clinical context, and readable supporting content.
- **Label** (600, 14px, 19.6px): buttons, filters, status pills, and concise metadata labels.

**The Useful Heading Rule.** Start with one clear screen title. Use section labels only for real work groupings such as Today or Patients, never as decorative eyebrows.

## Elevation

This system uses tonal layering and one-pixel boundaries instead of shadows. The Meridian card shadow token is `none`; depth comes from the warm canvas, raised paper inputs, tonal grouped surfaces, and clear dividers.

**The Flat-by-Default Rule.** Keep lists flat on the canvas. Use a raised or tonal surface only to group a task, an error state, or a focused form. Do not stack cards inside cards.

## Components

### Buttons

- **Shape:** 12px control radius, 48px hit height, and Public Sans SemiBold labels.
- **Primary:** Measured Indigo background with Raised Paper text. Use for the single primary action in a focused context.
- **Secondary:** Raised Paper background with a subtle divider border and Measured Indigo text.
- **Ghost:** no filled container, Measured Indigo text, and the same visible touch target.
- **Pressed and disabled:** pressed controls lower opacity slightly. Disabled controls use muted treatment but remain legible.

### Inputs / Fields

- **Style:** Raised Paper background, Soft Divider stroke, 12px radius, and 48px minimum hit height.
- **Focus:** replace the neutral border with Measured Indigo.
- **Validation:** use Clinical Red, Error Paper, Error Border, and explanatory text. Do not rely on border colour alone.
- **Accessibility:** provide an understandable label and a stable `testID`; search fields announce pending debounced updates politely.

### Chips and Status

- **Filters:** selected chips use Soft Indigo with Measured Indigo text. Unselected chips use Tonal Paper.
- **Status pills:** short semantic labels such as Draft, Finalized, or Archived. Labels remain readable without interpreting colour.

### Lists and Containers

- **Patient rows:** one full-row tap target with a safe disambiguator where available, last-visit metadata, optional status pill, and chevron. Do not add a separate Open profile action.
- **Boundaries:** use one Soft Divider between related rows. Prefer flat lists to card grids.
- **Grouped surfaces:** 12px radius, Tonal Paper when a task needs containment, never nested cards.

### Navigation

- **Bottom navigation:** Patients, Calendar, and Profile only. Keep the dock compact, flat, and separated by a Soft Divider.
- **Active destination:** Soft Indigo icon backing and Measured Indigo label text.
- **Primary screen actions:** place them where they remain visible and do not cover clinical content. A header action is preferred to a floating control that obscures a patient row.

## Do's and Don'ts

### Do:

- **Do** use shared Meridian tokens. Do not introduce near-duplicate colour values in feature code.
- **Do** make unfinished clinical work visible before browsing and secondary controls.
- **Do** reveal filters and secondary options only when requested, with one clear way to reset active filters.
- **Do** keep visible touch targets at least 44 points and hit targets at least 48 points.
- **Do** give every interactive element a stable `testID`, an accessible role, and an understandable label.
- **Do** verify phone layouts at 1080 by 2400, including keyboard and bottom-navigation clearance.

### Don't:

- **Don't** use gradients, gradient text, glass effects, translucent navigation, prominent shadows, or decorative animation.
- **Don't** use coloured side stripes, nested cards, identical card grids, or hero-metric layouts.
- **Don't** use colour as the only status or validation signal.
- **Don't** add decorative subtitles, uppercase eyebrow labels, marketing copy, or non-essential visual noise.
- **Don't** let a primary action cover a patient row or any other clinical content.
- **Don't** make AI assistance a prerequisite for manual documentation or final clinical judgment.
