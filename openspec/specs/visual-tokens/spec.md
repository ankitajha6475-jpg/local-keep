# visual-tokens Specification

## Purpose
Defines the shared visual tokens and media contract: scrollbars that clear the non-text contrast minimum, the declared colour scheme, and the loading behaviour every image must declare.

## Requirements

### Requirement: Scrollbars meet the non-text contrast minimum

Every scrollable container SHALL declare `scrollbar-width` and
`scrollbar-color`. The thumb and track colours SHALL be expressed as
separate custom properties so they can be reused. The thumb SHALL meet a
contrast ratio of at least 3:1 against the track and against the container's
background where the track is transparent.

Legacy `::-webkit-scrollbar` rules MAY be used as a fallback, but SHALL be
wrapped in `@supports not (scrollbar-color: auto)` so they do not conflict
with the standard properties in browsers that support both.

#### Scenario: Scrollbar thumb on a light surface

- **WHEN** a note preview is scrolled
- **THEN** the scrollbar thumb is at least 3:1 against the container background
- **AND** the thumb colour comes from the shared scrollbar token

#### Scenario: Scrollbar thumb on a dark surface

- **WHEN** the whiteboard pen inspector's log is scrolled
- **THEN** the scrollbar thumb is at least 3:1 against the dark panel
- **AND** the standard scrollbar properties are declared on that container

#### Scenario: The WebKit fallback is isolated

- **WHEN** the stylesheet is inspected
- **THEN** every `::-webkit-scrollbar` rule sits inside `@supports not (scrollbar-color: auto)`
- **AND** no rule outside that block customises a scrollbar

### Requirement: The interface declares its colour scheme

The application SHALL declare a `color-scheme` so that user-agent rendered
surfaces — scrollbars, `<select>` popups, autofill, and other browser-drawn
controls — match the interface instead of choosing their own appearance.

#### Scenario: Browser-drawn surfaces match the interface

- **WHEN** the browser draws a scrollbar or a select popup inside the app
- **THEN** it uses the light appearance declared by `color-scheme`

### Requirement: Images declare loading behaviour and reserve their space

Every `<img>` the application renders SHALL declare a decoding mode, and any
image whose size is not already fixed by its layout SHALL declare an
`aspect-ratio` so that it reserves its space before it loads. An image that
is not the page's largest contentful paint SHALL load lazily.

Alternative text SHALL describe the content, not the shape of the element.

#### Scenario: A card thumbnail arrives

- **WHEN** a dashboard card's thumbnail loads
- **THEN** the card's height does not change
- **AND** the image's alternative text names the note it belongs to

#### Scenario: A whiteboard page tile loads

- **WHEN** the pages drawer opens
- **THEN** the page images load lazily and decode asynchronously

#### Scenario: A note image renders

- **WHEN** a note body contains a markdown image
- **THEN** the rendered `<img>` declares `loading="lazy"` and `decoding="async"`
