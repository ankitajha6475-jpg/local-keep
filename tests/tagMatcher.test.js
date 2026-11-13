import test from 'node:test'
import assert from 'node:assert/strict'
import {
  globToRegex,
  parseWhitelistRules,
  isNoteAllowed,
  createTagMatcher
} from '../src/shared/tagMatcher.js'

test('globToRegex compiles tag patterns properly', () => {
  const r1 = globToRegex(':untagged')
  assert.ok(r1.test(':untagged'))
  assert.ok(!r1.test('work'))

  const rStar = globToRegex('*')
  assert.ok(rStar.test('work'))
  assert.ok(rStar.test(':untagged'))
  assert.ok(!rStar.test('work/sub'))

  const rGlobStar = globToRegex('**')
  assert.ok(rGlobStar.test('work/sub/sub2'))
  assert.ok(rGlobStar.test(':untagged'))

  const rDir = globToRegex('work/*')
  assert.ok(rDir.test('work/sub'))
  assert.ok(!rDir.test('work/sub/deep'))
  assert.ok(!rDir.test('work'))

  const rDeep = globToRegex('work/**')
  assert.ok(rDeep.test('work/sub'))
  assert.ok(rDeep.test('work/sub/deep'))

  const rBare = globToRegex('work')
  assert.ok(rBare.test('work'))
  assert.ok(rBare.test('work/sub'))
  assert.ok(!rBare.test('other'))
})

test('parseWhitelistRules handles comments, whitespace, and negation', () => {
  const input = `
    # Comment line
    work/*
    !work/secret/*

    :untagged
  `
  const rules = parseWhitelistRules(input)
  assert.equal(rules.length, 3)
  assert.equal(rules[0].isNeg, false)
  assert.equal(rules[1].isNeg, true)
  assert.equal(rules[2].isNeg, false)
})

test('untagged handling with :untagged pseudo-tag', () => {
  // Allow all except untagged
  const matcher = createTagMatcher(`
    *
    !:untagged
  `)
  assert.equal(matcher.isAllowed([]), false)
  assert.equal(matcher.isAllowed(['work']), true)

  // Allow only untagged
  const untaggedOnly = createTagMatcher(':untagged')
  assert.equal(untaggedOnly.isAllowed([]), true)
  assert.equal(untaggedOnly.isAllowed(null), true)
  assert.equal(untaggedOnly.isAllowed(['work']), false)
})

test('multi-tag evaluation: allow if any matches, unless any denied', () => {
  const matcher = createTagMatcher(`
    work/*
    !work/secret/*
  `)

  // Single allowed tag
  assert.equal(matcher.isAllowed(['work/dev']), true)

  // Single excluded tag
  assert.equal(matcher.isAllowed(['work/secret/keys']), false)

  // Multiple tags: one allowed, one denied -> DENIED
  assert.equal(matcher.isAllowed(['work/dev', 'work/secret/keys']), false)

  // Multiple tags: one allowed, one unmatched -> ALLOWED
  assert.equal(matcher.isAllowed(['work/dev', 'personal/notes']), true)

  // Multiple tags: all unmatched -> DENIED
  assert.equal(matcher.isAllowed(['personal/notes', 'other']), false)
})

test('order of rules: later rules override earlier rules for the same tag', () => {
  const matcher = createTagMatcher(`
    work/**
    !work/secret/**
    work/secret/public-doc
  `)

  assert.equal(matcher.isAllowed(['work/dev']), true)
  assert.equal(matcher.isAllowed(['work/secret/keys']), false)
  assert.equal(matcher.isAllowed(['work/secret/public-doc']), true)
})

test('admin vs non-admin behavior with empty rules', () => {
  const adminMatcher = createTagMatcher('', { isAdmin: true })
  assert.equal(adminMatcher.isUnrestricted, true)
  assert.equal(adminMatcher.isAllowed([]), true)
  assert.equal(adminMatcher.isAllowed(['any/tag']), true)

  const nonAdminMatcher = createTagMatcher('', { isAdmin: false })
  assert.equal(nonAdminMatcher.isUnrestricted, false)
  assert.equal(nonAdminMatcher.isAllowed([]), false)
  assert.equal(nonAdminMatcher.isAllowed(['any/tag']), false)
})
