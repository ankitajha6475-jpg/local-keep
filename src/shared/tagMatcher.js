import { normalizeTag } from './tags.js'

/**
 * Converts a single .gitignore-style tag pattern into a RegExp.
 *
 * Supported syntax:
 * - ':untagged': matches exactly ':untagged' (representing notes with no tags).
 * - '*' or '**': matches any tag or ':untagged'.
 * - 'work/*': matches direct children of work (e.g. 'work/design', but not 'work/design/logo').
 * - 'work/**': matches any depth under work (e.g. 'work/design/logo').
 * - 'work' (no slash, no glob): matches 'work' and any child under 'work' (e.g. 'work/design').
 * - leading '/': stripped (paths are already root-relative).
 *
 * @param {string} pat
 * @returns {RegExp}
 */
export function globToRegex(pat) {
  let p = pat.trim().toLowerCase()
  if (p === ':untagged') return /^:untagged$/
  if (p === '**') return /^.*$/
  if (p === '*') return /^([^/]+|:untagged)$/

  if (p.startsWith('/')) p = p.slice(1)

  let regexStr = '^'
  let i = 0
  while (i < p.length) {
    if (p.slice(i, i + 3) === '/**') {
      regexStr += '(/.*)?'
      i += 3
    } else if (p.slice(i, i + 2) === '**') {
      regexStr += '.*'
      i += 2
    } else if (p[i] === '*') {
      regexStr += '[^/]*'
      i++
    } else if (p[i] === '?') {
      regexStr += '[^/]'
      i++
    } else if ('+?.()|^$[]{}'.includes(p[i])) {
      regexStr += '\\' + p[i]
      i++
    } else {
      regexStr += p[i]
      i++
    }
  }

  // If pattern has no slash and is not a glob, match exact tag or any descendant
  if (!pat.includes('/') && !pat.includes('*')) {
    regexStr += '(/.*)?'
  }
  regexStr += '$'
  return new RegExp(regexStr)
}

/**
 * Parses a multi-line .gitignore-style pattern string into an array of rules.
 *
 * @param {string|null|undefined} text
 * @returns {Array<{ isNeg: boolean, regex: RegExp, raw: string }>}
 */
export function parseWhitelistRules(text) {
  if (typeof text !== 'string') return []
  const lines = text.split(/\r?\n/)
  const rules = []
  for (const raw of lines) {
    let line = raw.trim()
    if (!line || line.startsWith('#')) continue
    let isNeg = false
    if (line.startsWith('!')) {
      isNeg = true
      line = line.slice(1).trim()
    }
    if (!line) continue
    rules.push({
      isNeg,
      regex: globToRegex(line),
      raw: raw.trim()
    })
  }
  return rules
}

/**
 * Evaluates whether a set of note tags is allowed by the whitelist rules.
 *
 * Decision rules:
 * - If rules is empty: admins are allowed; non-admins are denied.
 * - Empty/null tags on a note are treated as [':untagged'].
 * - A note is allowed if at least one tag matches an ALLOW rule,
 *   AND no tag matches a DENY (!) rule.
 *
 * @param {Array<{ isNeg: boolean, regex: RegExp }>} rules
 * @param {string[]|null|undefined} tags
 * @param {object} [options]
 * @param {boolean} [options.isAdmin=false]
 * @returns {boolean}
 */
export function isNoteAllowed(rules, tags, { isAdmin = false } = {}) {
  if (!rules || rules.length === 0) {
    return Boolean(isAdmin)
  }

  const tagList = Array.isArray(tags) ? tags : []
  const effectiveTags = tagList.length === 0
    ? [':untagged']
    : tagList.map(t => (typeof t === 'string' ? t.toLowerCase().trim() : '')).filter(Boolean)

  if (effectiveTags.length === 0) {
    effectiveTags.push(':untagged')
  }

  let hasAllow = false

  for (const tag of effectiveTags) {
    let tagStatus = 'UNMATCHED'
    for (const rule of rules) {
      if (rule.regex.test(tag)) {
        tagStatus = rule.isNeg ? 'DENY' : 'ALLOW'
      }
    }

    if (tagStatus === 'DENY') {
      return false
    }
    if (tagStatus === 'ALLOW') {
      hasAllow = true
    }
  }

  return hasAllow
}

/**
 * Creates a reusable tag matcher object from a whitelist pattern string.
 *
 * @param {string|null|undefined} patternText
 * @param {object} [options]
 * @param {boolean} [options.isAdmin=false]
 * @returns {{ isAllowed: (tags: string[]) => boolean, rules: Array, raw: string }}
 */
export function createTagMatcher(patternText, { isAdmin = false } = {}) {
  const rules = parseWhitelistRules(patternText)
  const isUnrestrictedAdmin = isAdmin && rules.length === 0

  return {
    isUnrestricted: isUnrestrictedAdmin,
    rules,
    raw: patternText || '',
    isAllowed(tags) {
      if (isUnrestrictedAdmin) return true
      return isNoteAllowed(rules, tags, { isAdmin })
    }
  }
}
