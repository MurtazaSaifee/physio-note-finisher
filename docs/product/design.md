# Design System Strategy: Quiet Utility

## 1. Product character

Physio Note Finisher is a work tool for clinicians moving quickly between patients, appointments, and documentation. The interface should feel calm and dependable, but never decorative. It should make the next useful action obvious and keep clinical context easy to scan.

The visual direction is **quiet utility**: warm paper-like surfaces, dark slate text, a restrained indigo action colour, and small amounts of semantic colour for status. The interface earns attention through information order and spacing, not visual effects.

## 2. Tokens

Use the shared Meridian tokens. Do not introduce near-duplicate hex values in feature code.

| Role | Token | Value |
| --- | --- | --- |
| Canvas | `background` | `#F6F4EF` |
| Raised surface | `surface` | `#FBFAF7` |
| Tonal surface | `surfaceMuted` | `#EEEDE8` |
| Ink | `text` | `#1D2734` |
| Muted text | `textSubtle` | `#657080` |
| Main action | `primary` | `#3F527A` |
| Selected state | `primarySoft` | `#E8ECF6` |
| Divider | `border` | `#D9DCD8` |

Use `success`, `warning`, and `destructive` only to communicate state. A clinical status must not depend on colour alone; pair it with readable text.

## 3. Structure and hierarchy

- Start a screen with one clear title. Omit subtitles that restate the screen purpose.
- Put unfinished clinical work before browsing. On the Patients landing screen, show the most recently updated unfinished note, then the next future appointment, each opening the patient record.
- Use section labels only when they identify a meaningful work grouping, such as `Today` or `Patients`. Do not use decorative eyebrow labels, uppercase tracking, or marketing copy.
- Make patient rows a single tap target. Include a safe disambiguator where available (date of birth or phone ending), last-visit metadata, an optional status pill, and a chevron. Do not add a separate `Open profile` action.
- Show filters only after a clinician requests them. Make active filters easy to clear with one action.

## 4. Surfaces and boundaries

- Prefer a flat list on the canvas. Use a one-pixel `border` divider between related rows and at navigation boundaries.
- Use a raised or tonal surface only when it groups a task such as an inline form or error state. Do not stack cards inside cards.
- Use compact rounded corners for controls and modest rounding for grouped surfaces. A compact action can be fully rounded.
- Do not use gradients, glass effects, translucent navigation, side-stripe card accents, or prominent shadows. The floating Add button is solid indigo and remains easy to read.

## 5. Components and states

### Buttons

- Primary buttons are solid `primary` with `surface` text.
- Secondary buttons are raised `surface` with a subtle border.
- Ghost actions use `primary` text and no filled container.
- A pressed control lowers opacity slightly. Disabled controls use a muted surface and remain legible.

### Inputs

- Inputs have a raised surface, a subtle border, and a 44 point minimum touch target.
- A focused input uses the action-colour border. Validation errors use the semantic error colours and explanatory text.
- Search fields identify their purpose to assistive technology and announce pending debounced updates with a polite live region.

### Filters and status

- Selected chips use `primarySoft`; unselected chips are tonal.
- Status pills are short labels with semantic colour and never the only source of meaning.
- Archive and A–Z controls remain hidden by default on the Patients screen. When a filter is active, offer a single `Clear filters` action.

### Navigation

- Bottom navigation remains `Patients`, `Calendar`, and `Profile`.
- Keep the dock compact, flat, and separated by a divider. The active destination has a quiet `primarySoft` icon backing and text in `primary`.

## 6. Accessibility and testing

- Every interactive control needs a stable `testID`, an accessible role, and an understandable label.
- Screen titles and meaningful section labels use heading roles.
- Use live-region feedback for updating searches, create success, loading, and recoverable errors.
- Keep minimum visible touch targets at 44 points and hit targets at 48 points.
- Check the Android phone layout at 1080 by 2400. The Patients screen should show its worklist and the beginning of the directory without pushing the first patient row below the initial viewport.

## 7. Exported documents

Exported clinical documents use the same warm canvas, slate ink, muted metadata, and indigo date accent. Use simple top dividers between note sections; never use a decorative left stripe or a gradient.
