## ADDED Requirements

### Requirement: Tabbed dashboard views

The dashboard SHALL provide mutually exclusive **Notes**, **Archived**, and **Drafts** tabs with counts. The Notes tab SHALL show only active notes and the read-only Quick Shortcuts card. The Archived tab SHALL show only archived notes and SHALL NOT mix them with active notes. The Drafts tab SHALL show only pending drafts. Switching tabs SHALL clear the current selection and close card popovers. Search, tag filters, and sorting SHALL apply to the active view.

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

### Requirement: Draft listing

The system SHALL expose the persisted shared text drafts through `GET /api/drafts`. The list SHALL include only notes whose draft title/content differs from the head, SHALL exclude archived notes, and SHALL include the draft title/content, head title, note type, color, base/head revision ids, and draft update time. Clean drafts and corrupt rows SHALL be omitted. The Drafts tab SHALL render these entries as read-only cards with the normal note preview scrollbar, a Draft badge, and no selection checkbox, color picker, copy action, or delete/restore action. Opening a draft card SHALL open the note editor with the shared draft loaded.

#### Scenario: List a draft

- **WHEN** a note has an uncommitted shared draft
- **THEN** it appears in the Drafts tab with the draft title and content
- **AND** the draft timestamp is shown

#### Scenario: Clean or archived drafts

- **WHEN** a draft matches its head or its note is archived
- **THEN** it does not appear in the draft list

#### Scenario: Open a draft

- **WHEN** the user clicks a draft card
- **THEN** the note editor opens with the draft title and content loaded

#### Scenario: Refresh drafts

- **WHEN** the user clicks the Drafts refresh action
- **THEN** the list reloads from the persisted drafts

### Requirement: Editor draft actions

For an existing note, the editor's bottom actions SHALL offer **Save**, **Draft**, and **Discard**. Draft SHALL close the editor while keeping the shared draft for the Drafts tab without creating a revision. Discard SHALL discard the shared draft when this is the last editor and close without saving. Save SHALL continue to commit a revision. The unsaved-changes dialog SHALL offer Save, Draft, Discard, and Continue where Draft is available; all four actions SHALL have equal size and weight, and the previous **Continue Editing** label SHALL be **Continue**. A normal note card with a pending draft SHALL show a Draft badge.

#### Scenario: Keep a draft

- **WHEN** the user edits an existing note and clicks Draft
- **THEN** the editor closes
- **AND** the draft remains in the Drafts tab
- **AND** the note head and revision count are unchanged

#### Scenario: Discard changes

- **WHEN** the user clicks Discard in the editor or the unsaved dialog
- **THEN** the shared draft is discarded when no other editor is using it
- **AND** the editor closes without committing

#### Scenario: Equal unsaved actions

- **WHEN** the unsaved dialog is shown for an existing note
- **THEN** Save, Draft, Discard, and Continue have the same width, height, and font weight

#### Scenario: New note

- **WHEN** the editor is creating a new note
- **THEN** Draft is not offered because no note id or shared document exists yet
- **AND** Add Note and Discard remain available
