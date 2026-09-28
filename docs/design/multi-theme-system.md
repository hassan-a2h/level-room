# Multi-theme visual system

The approved boards are the visual source of truth for three complete learning experiences. A theme may change composition, density, illustration, type, motion, and disclosure; it must preserve the same learning content, actions, grading, progress, and accessible names.

`docs/design/references/*-board.png` are reference-only screenshots. They document visual direction and must never be embedded, cropped, or used as clickable UI assets. Production artwork must be created for its actual purpose and optimized independently.

## Theme identities

| Theme | Mode | Character | Display / body / label type | Radius character | Motion character |
|---|---|---|---|---|---|
| Living Atlas | Light | Calm editorial field guide; connected places, layered terrain, growth and evidence | Fraunces / Manrope / Manrope | 14px controls, 24px panels, 32px hero surfaces; soft organic silhouettes belong to illustration, not every control | Fast 140ms; standard 240ms; spatial 380ms; map paths and layered objects move gently; honor reduced motion |
| Curiosity Engine | Light | Bright, approachable product UI; clear blue progress, small playful marks, crisp cards | Manrope / Manrope / Manrope | 14px controls, 16px cards, 24px hero surfaces; mostly rounded rectangles | Fast 140ms; standard 240ms; spatial 380ms; purposeful feedback and short spatial transitions; honor reduced motion |
| Mission Workshop | Dark | Focused engineering workshop; graphite surfaces, warm paper work areas, technical labels and field photography | Fraunces / IBM Plex Mono / IBM Plex Mono | 6px controls, 8px work panels, 12px hero surfaces; square, tool-like geometry | Fast 120ms; standard 200ms; spatial 300ms; restrained status and instrument transitions; honor reduced motion |

## Semantic token contract

All packs expose the same token names. Values below are approved anchors and implementation ranges; component code consumes semantic names and does not branch on theme IDs.

| Token | Living Atlas | Curiosity Engine | Mission Workshop | Use |
|---|---|---|---|---|
| `canvas` | `#FAFAF8` | `#F4F6FF` | `#101820` | Route background |
| `panel` | `#FFFFFF` | `#FFFFFF` | `#19232C` | Primary cards and work surfaces |
| `elevated` | `#FFFFFF` | `#FFFFFF` | `#202D37` | Floating dialogs, menus and raised cards |
| `inset` | `#F2F4F1` | `#EEF1FA` | `#111A21` | Nested content and code/editor wells |
| `border` | `#E4E7E2` | `#E1E6F2` | `#34434E` | Quiet separators and control boundaries |
| `borderStrong` | `#B9C2B8` | `#BBC5DA` | `#52636E` | Emphasized boundaries |
| `ink` | `#17211C` | `#101727` | `#F2EEE5` | Primary text |
| `inkSoft` | `#46534A` | `#3C465F` | `#D0D6D3` | Supporting text |
| `inkMuted` | `#69756C` | `#626C86` | `#9EAAA9` | Metadata and low-emphasis text |
| `primary` | `#337C55` | `#315FDA` | `#C8F24A` | Primary action, current progress |
| `primaryHover` | `#286544` | `#234AC4` | `#D7FF68` | Hovered primary action |
| `primaryContrast` | `#FFFFFF` | `#FFFFFF` | `#152018` | Text/icons on primary action |
| `secondary` | `#78A88A` | `#3CA874` | `#FF713E` | Secondary progress and supporting emphasis |
| `accentWarm` | `#F28A78` | `#FF7B72` | `#FF713E` | Warm feedback and illustration detail |
| `accentSun` | `#F2C65B` | `#F4C54C` | `#C8F24A` | Highlights and success markers |
| `success` | `#34764A` | `#24764D` | `#C8F24A` | Positive status, always paired with text/icon |
| `warning` | `#805B21` | `#7C5510` | `#F4BD57` | Warning status, always paired with text/icon |
| `danger` | `#A34248` | `#A53B4A` | `#FF785F` | Error/destructive status, never color alone |
| `fontDisplay` | `Fraunces` | `Manrope` | `Fraunces` | Large editorial headings |
| `fontBody` | `Manrope` | `Manrope` | `IBM Plex Mono` | Reading and instructional content |
| `fontLabel` | `Manrope` | `Manrope` | `IBM Plex Mono` | Navigation, controls and compact labels |
| `radiusControl` | `0.875rem` | `0.875rem` | `0.375rem` | Inputs and buttons |
| `radiusPanel` | `1.5rem` | `1rem` | `0.5rem` | Cards and panels |
| `radiusHero` | `2rem` | `1.5rem` | `0.75rem` | Route hero and featured surfaces |
| `motionFast` | `140ms` | `140ms` | `120ms` | Hover and pressed feedback |
| `motionStandard` | `240ms` | `240ms` | `200ms` | Disclosure and state transitions |
| `motionSpatial` | `380ms` | `380ms` | `300ms` | Route-stage or illustration transitions |

Color contrast must meet WCAG AA for text and non-text controls. Status always includes a label, icon, shape or other non-color cue. Focus remains clearly visible on canvas, panel, elevated and inset surfaces.

## Surface rules

| Surface | Living Atlas | Curiosity Engine | Mission Workshop |
|---|---|---|---|
| Canvas | Warm white with generous breathing room and quiet topographic texture only where useful | Cool blue-white, clean and bright | Deep graphite/navy with subtle technical texture |
| Panel | White, lightly separated by a soft border or shallow shadow | White, crisp border, modest shadow | Dark steel shell or warm paper-like task sheet for authored learning content |
| Elevated | White floating cards with soft depth | White overlays with clear elevation | Distinct steel overlays; do not imitate a light theme |
| Inset | Pale sage/stone grouping surface | Pale blue-lavender grouping surface | Near-black editor/code/input well |
| Primary control | Botanical green; rounded and calm | Saturated blue; rounded and direct | Signal lime or safety orange by action role; compact and tool-like |
| Illustration | Layered maps, islands, waterways, plants and crafted 3D terrain | Simple blue progress marks, small playful icons, clouds, containers and mountain accents | Mission photography, technical diagrams, orange tooling symbols and field notes |
| Density | Spacious, centered editorial hierarchy; one dominant learning object | Clear product cards with visible progress and next action | Information-rich but grouped like a real workbench; technical detail stays legible |

Theme views may use decorative taglines only when hidden from assistive technology. Learning objects, dialogs and controls remain real accessible UI rather than flattened board imagery.
