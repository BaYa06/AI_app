---
name: Flashly
description: "Учись умнее. Запоминай надолго." Flashcards with spaced repetition for learners and their teachers.
colors:
  primary: "#6467F2"
  primary-pressed: "#4F46E5"
  on-primary: "#FFFFFF"
  primary-on-dark: "#818CF8"
  primary-fill-on-dark: "#6366F1"
  secondary: "#8B5CF6"
  success: "#10B981"
  success-text: "#047857"
  warning: "#F59E0B"
  warning-text: "#B45309"
  error: "#EF4444"
  error-text: "#DC2626"
  info: "#3B82F6"
  background: "#FFFFFF"
  surface: "#FFFFFF"
  surface-muted: "#F1F5F9"
  surface-variant: "#F3F4F6"
  border: "#DBDBE6"
  text-primary: "#111827"
  text-secondary: "#6B7280"
  text-tertiary: "#8A8F99"
  background-dark: "#101122"
  surface-dark: "#1A1B30"
  surface-muted-dark: "#232540"
  streak: "#F97316"
  star: "#F59E0B"
  silver: "#8A94A6"
  bronze: "#C2703D"
typography:
  hero:
    fontFamily: "-apple-system, 'SF Pro Text', Roboto, system-ui, sans-serif"
    fontSize: "72px"
    fontWeight: 700
    lineHeight: "80px"
    letterSpacing: "-1px"
  display:
    fontFamily: "-apple-system, 'SF Pro Text', Roboto, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 700
    lineHeight: "48px"
    letterSpacing: "-0.5px"
  headline:
    fontFamily: "-apple-system, 'SF Pro Text', Roboto, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: "40px"
    letterSpacing: "-0.5px"
  title-large:
    fontFamily: "-apple-system, 'SF Pro Text', Roboto, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: "32px"
    letterSpacing: "-0.3px"
  title:
    fontFamily: "-apple-system, 'SF Pro Text', Roboto, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "28px"
  body-large:
    fontFamily: "-apple-system, 'SF Pro Text', Roboto, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: "26px"
  body:
    fontFamily: "-apple-system, 'SF Pro Text', Roboto, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
  body-small:
    fontFamily: "-apple-system, 'SF Pro Text', Roboto, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  label:
    fontFamily: "-apple-system, 'SF Pro Text', Roboto, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: "20px"
    letterSpacing: "0.2px"
  button:
    fontFamily: "-apple-system, 'SF Pro Text', Roboto, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "24px"
    letterSpacing: "0.5px"
  caption:
    fontFamily: "-apple-system, 'SF Pro Text', Roboto, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
  overline:
    fontFamily: "-apple-system, 'SF Pro Text', Roboto, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: "16px"
    letterSpacing: "0.8px"
rounded:
  s: "8px"
  m: "12px"
  l: "16px"
  xl: "24px"
  full: "9999px"
spacing:
  xxs: "4px"
  xs: "8px"
  s: "12px"
  m: "16px"
  l: "24px"
  xl: "32px"
  xxl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.m}"
    height: "52px"
    padding: "0 24px"
  button-primary-pressed:
    backgroundColor: "{colors.primary-pressed}"
    textColor: "{colors.on-primary}"
  button-primary-small:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.m}"
    height: "36px"
    padding: "0 12px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    typography: "{typography.button}"
    rounded: "{rounded.m}"
    height: "52px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    typography: "{typography.button}"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.error-text}"
    typography: "{typography.button}"
  button-icon:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.full}"
    size: "44px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.m}"
    height: "48px"
    padding: "0 12px"
  input-search:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.m}"
    height: "48px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.l}"
    padding: "16px"
  card-selected:
    backgroundColor: "#6467F21A"
    rounded: "{rounded.l}"
    padding: "16px"
  chip:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.text-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    height: "36px"
    padding: "0 12px"
  chip-selected:
    backgroundColor: "#6467F21A"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
  badge:
    typography: "{typography.caption}"
    rounded: "{rounded.s}"
    padding: "2px 8px"
  progress-bar:
    backgroundColor: "{colors.surface-muted}"
    rounded: "{rounded.full}"
    height: "8px"
  list-row:
    backgroundColor: "{colors.surface}"
    typography: "{typography.body}"
    height: "52px"
    padding: "12px 16px"
---

# Design System: Flashly

## Overview

**Creative North Star: "The Calm Coach"**

Flashly looks like a patient coach standing next to the learner: lots of white air, one violet voice, and color that only ever means something. The learner opens the app for a few minutes a day; the screen must tell them what to do next in one glance and praise progress without noise. Teachers see the same calm surface with more data on it, never a louder one.

Density is low on learner screens (one main action, large touch targets, generous 16 px gutters) and moderate on teacher screens (lists, tables, counts), but the vocabulary is identical: the same tokens, the same five radii, the same flat cards with a hairline border. Depth comes from tone and borders, not from shadows. Motion is short and functional; delight is reserved for real achievements (streak, finished session) and never interrupts.

Everything is token-driven (`src/constants/colors.ts`, `typography.ts`, `spacing.ts`) and every screen works in both light and dark themes. The rules in plan/done/brandbook.md are the long-form source; this file is their summary for anyone designing a new screen.

**Key Characteristics:**
- One accent (Flashly Violet) on white; semantic colors carry status, never decoration.
- System font (SF Pro / Roboto), strict scale of 12–40 px, weights 400 / 600 / 700 only.
- Flat, bordered surfaces with soft 12–16 px corners; no gradients.
- One primary button per new screen; everything else is quieter.
- Russian interface, «ты» everywhere, no emoji in UI chrome, no invented data.

## Colors

A white, airy field with a single violet accent and a small set of semantic hues that always pair a fill with a darker readable text tone.

### Primary
- **Flashly Violet** (primary): the brand voice and the background of the app icon. Main buttons, active tabs and states, links, progress fill, mature-word status. In dark theme the readable accent shifts to Lavender Violet (primary-on-dark) and buttons fill with Deep Indigo (primary-fill-on-dark) so white text keeps 4.47:1.
- **Pressed Indigo** (primary-pressed): pressed state of the main button only.

### Secondary
- **Soft Amethyst** (secondary): secondary accents in badges and illustrations. Never a button color.

### Tertiary
- **Semantic set**: Mint Success (success) with Forest text (success-text); Amber Warning (warning) with Burnt Amber text (warning-text); Coral Error (error) with Crimson text (error-text); Sky Info (info). Game and domain hues are fixed meanings: streak orange, star gold, silver, bronze.

### Neutral
- **Paper White** (background, surface): screens and cards.
- **Mist Slate** (surface-muted): chips, back button, search field, inactive fills, progress track.
- **Cloud Grey** (surface-variant): blocks nested inside cards.
- **Lilac Hairline** (border): card and field borders, dividers.
- **Ink** (text-primary), **Slate Grey** (text-secondary), **Faded Slate** (text-tertiary, placeholders and small meta only).
- **Night Navy / Midnight Surface / Midnight Muted** (background-dark, surface-dark, surface-muted-dark): solid dark-theme layers; no translucent surfaces.

### Named Rules
**The One Voice Rule.** Flashly Violet is the only accent. A second violet (#6366F1 on a light background) is forbidden.

**The Fill and Ink Rule.** Light fills (#10B981, #F59E0B) are never used as text on white; text uses the paired *-text token.

**The Three Alphas Rule.** Tinted backgrounds use only 10 %, 20 % or 40 % of a token (`alpha(color, 10|20|40)`), nothing in between.

## Typography

**Display Font:** System (SF Pro on iOS and Apple web, Roboto on Android)
**Body Font:** System, same family
**Label/Mono Font:** none distinct

**Character:** One native family in a strict scale. Hierarchy comes from size and weight, not from typefaces or case.

### Hierarchy
- **Hero** (700, 72/80): only the number on the streak celebration.
- **Display** (700, 40/48): big numbers: game code, score, test result.
- **Headline** (700, 32/40): welcome and summary headings.
- **Title Large** (700, 24/32): root-screen titles, the word on a flashcard.
- **Title** (600, 20/28): section and dialog titles.
- **Body Large** (400, 18/26): lead text, the word in a test.
- **Body** (400, 16/24): main text and list rows.
- **Body Small** (400, 14/20): descriptions, secondary text.
- **Label** (600, 14/20): field labels, small buttons. **Button** (600, 16/24) for main buttons.
- **Caption** (400, 12/16): meta, hints under fields.
- **Overline** (600, 12/16, 0.8 px, UPPERCASE): section labels like «АККАУНТ».

### Named Rules
**The Scale Rule.** Sizes only 12, 14, 16, 18, 20, 24, 32, 40 (72 for the hero). Weights only 400, 600, 700. Nothing under 12 px.

**The One Caps Rule.** Uppercase exists only as Overline. No all-caps headings or buttons.

## Layout

A 4 pt grid with seven spacing steps (4, 8, 12, 16, 24, 32, 48). On phones the side gutter is always 16; sections are 24 apart, cards inside a section 12 apart, card padding 16. Fixed heights: main button 52, small button 36, field 48, header 56, list row ≥ 52, tab bar 64, minimum touch target 44. Breakpoints exist at 768 (tablet) and 1024 (desktop); the web teacher cabinet uses a fixed left navigation and a fluid content column that stacks under 900 px.

### Named Rules
**The 16 Gutter Rule.** Every phone screen has the same 16 px side padding. No per-screen exceptions.

## Elevation & Depth

Flat by default. Depth comes from tonal layering (Paper White on Mist Slate, nested Cloud Grey blocks) and 1 px hairline borders. A card uses a border or a soft shadow, never both; dark theme uses no shadows at all and separates layers with the border. The overlay under sheets is black at 50 % (light) and 70 % (dark). On iOS 26, Liquid Glass appears only on navigation and controls (tab bar, header buttons), never on content.

### Shadow Vocabulary
- **Soft lift** (`box-shadow: 0 4px 16px rgba(17, 24, 39, 0.06)`): a sticky header or bar floating over scrolled content on the web; light theme only.

### Named Rules
**The Border or Shadow Rule.** One separation device per surface. Never a border plus a shadow.

## Shapes

Gently rounded, never pill-everything: five radii only. 8 for chips and small badges, 12 for buttons and fields, 16 for cards and list groups, 24 for the top corners of sheets and dialogs, full for avatars, round icon buttons, toggles and progress bars.

### Named Rules
**The Five Radii Rule.** Only 8 / 12 / 16 / 24 / full. Any other corner value is a bug.

## Components

Soft and confident: big comfortable targets, gently rounded corners, flat surfaces with a hairline edge; one filled main action, everything else quieter.

### Buttons
- **Shape:** gently curved (12 px), height 52 (36 for compact buttons inside cards).
- **Primary:** Flashly Violet fill, white Button text, full width on phones; one per new screen.
- **Pressed / Disabled / Loading:** Pressed Indigo or 0.85 opacity, scale 0.98 allowed on the main button; disabled is 0.5 opacity with no color change; loading swaps text for a spinner without changing width.
- **Secondary:** transparent with a 1.5 px violet border and violet text.
- **Quiet:** no fill or border, violet (or Slate Grey) text: «Отмена», «Пропустить».
- **Danger:** Crimson text without fill; a filled Coral button only inside a confirmation dialog.
- **Icon:** 44 px circle on Mist Slate with a 20–24 px Lucide icon; always has an accessibility label.

### Chips
- **Style:** Mist Slate fill, 1 px border in the same tone, full radius, Label text.
- **Selected:** violet tint at 10 % with a 40 % violet border and violet text.

### Cards / Containers
- **Corner Style:** 16 px.
- **Background:** Paper White on the screen; selected cards use the 10 % violet tint.
- **Shadow Strategy:** none (see Elevation); 1 px Lilac Hairline border.
- **Internal Padding:** 16 (12 for compact cards). Grouped rows share one card with 1 px dividers inset 16 from the left and an Overline label above.

### Inputs / Fields
- **Style:** 48 px high, 12 px radius, 1 px Lilac Hairline border, Paper White fill (Mist Slate for search). Label above in Label/Slate Grey, 8 px gap.
- **Focus:** border turns Flashly Violet.
- **Error / Disabled:** Coral border plus a Caption in Crimson under the field. The keyboard never opens on its own, except for search and the 4-digit code.

### Navigation
- **Phone:** bottom tab bar, max 4 tabs (Главная, Библиотека, Тест, Профиль), Ionicons 24 with a 12/600 caption; active Flashly Violet, inactive Faded Slate. Header 56 px: back icon button left; nested screens center the 16/600 title, root tabs left-align a Title Large heading.
- **Web teacher cabinet:** fixed left navigation (white, hairline right border) with the app icon, text items, a 10 % violet tint for the active item, attention badges, and the account pinned at the bottom.

### Progress Bar (signature)
8 px track on Mist Slate with full radius; fill is Flashly Violet or a semantic color. Word sets use a segmented version with the four word-status colors.

### Bottom Sheet
The default overlay: Paper White, 24 px top corners, a 36×4 grab handle, the scrim beneath, always a quiet «Отмена» at the bottom. One window at a time.

## Do's and Don'ts

### Do:
- **Do** take every color, size, spacing and radius from the tokens in `src/constants/`; a missing value becomes a new token first.
- **Do** pair a status color with an icon (✓ / ✕ as Lucide icons), never color alone.
- **Do** keep text contrast ≥ 4.5:1 (≥ 3:1 for 18 px bold text and icons) and touch targets ≥ 44×44.
- **Do** check every new screen in light and dark themes.
- **Do** use Lucide icons at 16 / 20 / 24 / 32 / 48 with the default 2 px stroke; Ionicons only in the bottom tab bar.
- **Do** show skeletons on Mist Slate for loading, and an empty state with icon, title, one sentence and one action.

### Don't:
- **Don't** use emoji in UI chrome (buttons, statuses, celebrations, category icons); language flags and user content are the only exceptions.
- **Don't** introduce a second accent violet, gradients, or a border plus a shadow on the same surface.
- **Don't** use font sizes outside the scale, weights 500 / 800 / 900, or text under 12 px.
- **Don't** write `isDark ? '#…' : '#…'` in a screen; theme differences live in tokens.
- **Don't** show invented numbers, names or dates to real users.
- **Don't** use system alerts except for destructive confirmations; success is a 2-second toast.
