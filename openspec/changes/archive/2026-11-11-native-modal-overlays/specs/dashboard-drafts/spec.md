## MODIFIED Requirements

### Requirement: Tabbed dashboard views

The dashboard SHALL provide mutually exclusive **Notes**, **Archived**, and **Drafts** tabs with counts. The Notes tab SHALL show only active notes and the read-only Quick Shortcuts card. The Archived tab SHALL show only archived notes and SHALL NOT mix them with active notes. The Drafts tab SHALL show only pending drafts. Switching tabs SHALL clear the current selection and close card popovers. Search, tag filters, and sorting SHALL apply to the active view.

The tabs SHALL implement the ARIA tab pattern. The selected tab SHALL have `tabindex="0"` and the other tabs `tabindex="-1"`. `Left` and `Right` SHALL move between tabs and select them, and `Home` and `End` SHALL move to the first and last tab. Each tab SHALL reference its panel with `aria-controls`, and the panel SHALL be a `role="tabpanel"` labelled by its tab.

#### Scenario: Notes and archived do not mix

- **WHEN** the workspace contains both active and archived notes
- **THEN** the Notes tab lists only the active notes
- **AND** the Archived tab lists only the archived notes
- **AND** the Quick Shortcuts card appears only in Notes

#### Scenario: Switch views

- **WHEN** the user switches from Notes to Archived or Drafts
- **THEN** any current selection is cleared
- **AND** the count and sort controls describe the selected view

#### Scenario: Empty archived view

- **WHEN** the Archived tab has no archived notes
- **THEN** the grid shows an empty-state message instead of active notes

#### Scenario: Arrow keys move between tabs

- **WHEN** the Notes tab is selected and the user presses ArrowRight
- **THEN** the Archived tab becomes selected
- **AND** focus follows the selection

#### Scenario: The panel is labelled

- **WHEN** a screen reader reaches the notes panel
- **THEN** the panel announces the name of the tab that controls it
