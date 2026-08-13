import test from 'node:test'
import assert from 'node:assert/strict'

import { shouldUseHandTool, isFingerTouch } from '../src/utils/whiteboardTouch.js'

test('single non-stylus touch should switch drawing tools to hand', () => {
  assert.equal(shouldUseHandTool('freedraw', { touchType: 'direct' }), true)
  assert.equal(shouldUseHandTool('freedraw', { touchType: 'stylus' }), false)
})

test('non-stylus touches are treated as finger input while stylus touches are excluded', () => {
  assert.equal(isFingerTouch({ touchType: 'direct' }), true)
  assert.equal(isFingerTouch({ touchType: 'stylus' }), false)
  assert.equal(isFingerTouch({ touchType: 'fine' }), true)
})
