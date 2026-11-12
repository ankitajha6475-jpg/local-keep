## ADDED Requirements

### Requirement: Focus indicators meet a contrast minimum

Every focusable control SHALL show a focus indicator when it receives keyboard
focus. The indicator SHALL be an outline of at least 2px in a colour with a
contrast ratio of at least 3:1 against the adjacent background. Controls MUST
NOT remove the native focus indicator without providing an equivalent
replacement.

Focus indicators SHALL be shown on `:focus-visible`, so pointer interaction does
not paint them. A component MAY override the shared indicator deliberately by
declaring its own outline.

#### Scenario: Keyboard focus on a control

- **WHEN** the user tabs to a button, link, input, select, or textarea
- **THEN** the control shows a visible focus outline
- **AND** the outline colour is at least 3:1 against the background

#### Scenario: Pointer focus on a control

- **WHEN** the user clicks a button with the mouse
- **THEN** no focus outline is painted
- **AND** the control still shows its own hover or active styling

#### Scenario: No control removes the native indicator

- **WHEN** the stylesheet is inspected
- **THEN** no rule sets `outline: none` on a focusable control

### Requirement: Controls expose an accessible name

Every control SHALL have an accessible name. A control whose visible content is
only an icon or a symbol SHALL be named with `aria-label`. A `title` attribute
MUST NOT be used as the naming mechanism, because it is not exposed to
assistive technology.

#### Scenario: Icon-only close button

- **WHEN** a screen reader focuses a close button that shows only `×`
- **THEN** the button announces a name describing its action

#### Scenario: Icon button with a tooltip

- **WHEN** a control has both a visual tooltip and an accessible name
- **THEN** the accessible name describes the action
- **AND** the tooltip may keep the same wording

### Requirement: Form controls are labelled

Every form control SHALL be associated with a label. The association SHALL use
an explicit `for`/`id` pair so that voice-control software, which matches on
the explicit relationship, can activate the control by its label.

#### Scenario: Labelled property input

- **WHEN** the properties panel renders a row for a user property
- **THEN** the row's label points at that row's input through `for`/`id`
- **AND** a screen reader announces the label with the field

### Requirement: Text meets the contrast minimum

Body text SHALL meet a contrast ratio of at least 4.5:1 against the surface it
sits on. Large text SHALL meet at least 3:1. Muted and secondary text SHALL be
expressed as shared tokens so that the whole application changes together, and
placeholder text SHALL meet the same minimum as body text.

#### Scenario: Muted metadata text

- **WHEN** a note's date, a history actor, or a settings hint is rendered
- **THEN** the text is at least 4.5:1 against the surface behind it

#### Scenario: Placeholder text

- **WHEN** an empty editor or an empty search field shows its placeholder
- **THEN** the placeholder is at least 4.5:1 against the surface behind it

#### Scenario: Success confirmation

- **WHEN** a copy action confirms with a success colour
- **THEN** the confirmation text is at least 4.5:1 against the surface behind it

### Requirement: Motion is opt-in

Spatial movement SHALL be opt-in. Keyframe animations and transitions on
`transform` SHALL only apply when the user has not asked for reduced motion,
by being declared inside `@media (prefers-reduced-motion: no-preference)`.
Transitions on colour, background, border, opacity, filter, box-shadow, and
border-radius SHALL remain available regardless of the motion preference.

When an animation is not applied, the element SHALL remain in the state the
animation would have ended in, and SHALL NOT be left hidden.

#### Scenario: Reduced motion preference

- **WHEN** the operating system requests reduced motion
- **THEN** no entrance animation, pulse, or spatial transition runs
- **AND** colour transitions still run

#### Scenario: No preference

- **WHEN** the operating system expresses no motion preference
- **THEN** the entrance animations and spatial transitions run as before

### Requirement: Announcements use centralised live regions

The application SHALL keep exactly one polite live region and one assertive
live region, both always present in the document. Non-visible feedback SHALL be
announced through them rather than through ad-hoc `role="status"` elements. A
message repeated while the previous one is still showing SHALL be announced
again.

#### Scenario: Polite announcement

- **WHEN** the application reports a non-urgent outcome
- **THEN** the message is written to the polite live region
- **AND** a screen reader announces it without interrupting

#### Scenario: Assertive announcement

- **WHEN** the application reports an error
- **THEN** the message is written to the assertive live region
- **AND** a screen reader announces it immediately

#### Scenario: One region per level

- **WHEN** the document is inspected
- **THEN** exactly one polite and one assertive live region exist
- **AND** no other element declares `role="status"` or `role="alert"`
