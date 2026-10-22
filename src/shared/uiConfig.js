// Interface dimensions that can be overridden by the config file or at runtime.
// Values are pixels; the CSS uses them with viewport-aware min() fallbacks.

export const UI_CONFIG_FIELDS = [
  {
    key: 'noteModalWidth',
    label: 'Note editor width',
    min: 480,
    max: 2400,
    step: 10,
    default: 960
  },
  {
    key: 'noteModalHeight',
    label: 'Note editor height',
    min: 360,
    max: 1600,
    step: 10,
    default: 760
  },
  {
    key: 'linkDialogWidth',
    label: 'Link dialog width',
    min: 360,
    max: 1200,
    step: 10,
    default: 540
  },
  {
    key: 'graphWidth',
    label: 'Relationship graph width',
    min: 480,
    max: 2400,
    step: 10,
    default: 1100
  },
  {
    key: 'graphHeight',
    label: 'Relationship graph height',
    min: 360,
    max: 1600,
    step: 10,
    default: 760
  },
  {
    key: 'linksPanelWidth',
    label: 'Selection links panel width',
    min: 480,
    max: 2400,
    step: 10,
    default: 1100
  },
  {
    key: 'linksPanelHeight',
    label: 'Selection links panel height',
    min: 360,
    max: 1600,
    step: 10,
    default: 780
  }
]

export const DEFAULT_UI_CONFIG = Object.freeze(
  Object.fromEntries(UI_CONFIG_FIELDS.map(field => [field.key, field.default]))
)

export function clampUiValue(field, value) {
  const numeric = Math.round(Number(value))
  if (!Number.isFinite(numeric)) return null
  return Math.max(field.min, Math.min(field.max, numeric))
}

/** Keep only known keys with clamped integer values. */
export function pickUiConfig(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const result = {}
  for (const field of UI_CONFIG_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(input, field.key)) continue
    const value = clampUiValue(field, input[field.key])
    if (value != null) result[field.key] = value
  }
  return result
}

export function normalizeUiConfig(input = {}, base = DEFAULT_UI_CONFIG) {
  return { ...base, ...pickUiConfig(input) }
}
