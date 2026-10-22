## ADDED Requirements

### Requirement: Markdown formatting toolbar

The note editor SHALL provide a grouped toolbar with common markdown tools: bold, italic, strikethrough, inline code, link, wiki link, headings 1-3, blockquote, bulleted list, numbered list, task list, code block, table, and horizontal rule. The toolbar SHALL work in both Visual and Source editor modes. Clicking a tool MUST preserve the current editor or textarea selection and MUST update the canonical markdown through the existing serialization path.

Headings, blockquotes, and list formats SHALL toggle off when the current block or every selected line already uses the same format. Unordered, ordered, and task-list prefixes SHALL replace each other rather than stack.

#### Scenario: Format selected text in Visual mode

- **WHEN** the user selects text and presses Bold
- **THEN** the selected text is bolded in the editor
- **AND** saving writes `**selected text**` to the canonical markdown

#### Scenario: Format a source selection

- **WHEN** the user selects text in Source mode and presses Inline code
- **THEN** the selection is wrapped in backticks
- **AND** the textarea selection remains on the wrapped text

#### Scenario: Toggle a heading

- **WHEN** the caret is in a paragraph and the user chooses Heading 2
- **THEN** the block becomes an H2
- **AND** choosing Heading 2 again returns it to a paragraph

#### Scenario: Replace a list prefix

- **WHEN** the current line is a bulleted list item and the user chooses Numbered list
- **THEN** the line becomes an ordered list item without a duplicate bullet

### Requirement: Toolbar keyboard shortcuts

Each toolbar tool SHALL have a keyboard shortcut that performs the same action in Visual and Source modes. Shortcut handling MUST require Ctrl or Cmd, MUST NOT trigger during IME composition, and MUST call `preventDefault` so the browser does not apply a conflicting native action. Focused toolbar buttons and editor keydown handlers SHALL use one shared shortcut definition.

#### Scenario: Shortcut applies formatting

- **WHEN** the editor has focus and the user presses the Bold shortcut
- **THEN** the current selection is bolded
- **AND** no browser-native action runs

#### Scenario: IME composition is not interrupted

- **WHEN** text composition is active
- **THEN** toolbar shortcut handling does not run

### Requirement: Shortcut tooltips revealed by Alt

Toolbar buttons SHALL normally show the tool name on hover. While Alt/Option is held, hovering or focusing a toolbar button SHALL show its platform-appropriate shortcut instead (Cmd on macOS, Ctrl elsewhere, Option for Alt). The reveal state SHALL reset on keyup or window blur.

#### Scenario: Reveal shortcuts

- **WHEN** the user holds Alt and hovers a toolbar button
- **THEN** the tooltip shows that button's keyboard shortcut

#### Scenario: Normal tooltip

- **WHEN** Alt is not held and the user hovers a toolbar button
- **THEN** the tooltip shows the tool name
