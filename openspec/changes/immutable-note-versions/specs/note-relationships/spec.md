## ADDED Requirements

### Requirement: Version-pinned link targets

A wiki link SHALL record the immutable revision of its target that it references. `note_links` MUST store a `target_revision_id` identifying that revision. A link's reference to a version MUST remain unchanged when the target note receives new revisions. Links MAY pin explicitly via `[[note:<id>@<rev>]]`; a bare `[[note:<id>]]` or title link SHALL auto-pin to the target's head revision at link-creation time.

#### Scenario: Explicit version pin

- **WHEN** a note contains `[[note:B@2|details]]`
- **THEN** the link records `target_revision_id` = revision 2 of note B

#### Scenario: Auto-pin on link creation

- **WHEN** a note links to note B while B's head is revision 3
- **THEN** the link records `target_revision_id` = revision 3 of B
- **AND** after B is edited to revision 4, the link's `target_revision_id` is unchanged

#### Scenario: Reference stays on the pinned version

- **WHEN** note A links to note B (pinned to B revision 2) and B is edited to revision 4
- **THEN** A's link still references B revision 2
- **AND** the pinned revision 2 remains readable and unchanged

### Requirement: Rendering pinned links

A resolved version-pinned link SHALL render the content of its pinned (immutable) revision, so editing the target does not change what a referencing note shows. A mechanism to view the target's latest version MAY be offered alongside the pinned rendering.

#### Scenario: Frozen rendering

- **WHEN** note A links to note B pinned to revision 2, and B's head is revision 4
- **THEN** rendering A's link reflects revision 2 of B
- **AND** it does not change when B is edited again

#### Scenario: Pinned revision always available

- **WHEN** a pinned link is rendered
- **THEN** the pinned revision content is shown even though the target has newer revisions
