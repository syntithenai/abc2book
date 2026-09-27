/**
 * @jest-environment jsdom
 */
/* eslint-disable react-hooks/rules-of-hooks -- test helpers call pure hook factories */
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import useAbcTools from '../useAbcTools'
import { resolvePrimaryVoiceKey } from '../abcVoiceUtils'
import ChordsWizard from './ChordsWizard'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

jest.mock('./ChordsSearchButton', function() { return function() { return null } })
jest.mock('./ChordSectionRecordModal', function() { return function() { return null } })
jest.mock('./LyricsChordsHelpModal', function() { return function() { return null } })

const abcTools = useAbcTools()

function Harness(props) {
  const [, setTick] = useState(0)
  const tune = props.tune
  const tunebook = {
    abcTools: abcTools,
    saveTune: function() { setTick(function(t) { return t + 1 }) },
  }
  return (
    <ChordsWizard
      tunebook={tunebook}
      tune={tune}
      abc={abcTools.json2abc(tune)}
      notes={tune.voices[resolvePrimaryVoiceKey(tune.voices)].notes}
    />
  )
}

function sectionCharts(container) {
  return Array.from(container.querySelectorAll('.chords-wizard-section textarea')).map(function(el) {
    return el.value.replace(/\s+/g, ' ').trim()
  })
}

async function deleteSectionAt(tune, index) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async function() { root.render(<Harness tune={tune} />) })
  const deletes = Array.from(container.querySelectorAll('button')).filter(function(b) {
    return b.textContent === 'Delete'
  })
  await act(async function() {
    deletes[index].dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  const charts = sectionCharts(container)
  act(function() { root.unmount() })
  container.remove()
  return charts
}

describe('ChordsWizard delete section', function() {
  const originalConfirm = window.confirm
  beforeEach(function() { window.confirm = function() { return true } })
  afterEach(function() { window.confirm = originalConfirm })

  test('chords-only song with lyric section markers', async function() {
    const tune = abcTools.abc2json([
      'X:1', 'T:Song', 'M:4/4', 'L:1/4', 'K:C',
      '"C"zzzz|"F"zzzz||"G"zzzz|"C"zzzz||"Am"zzzz|"F"zzzz||"G"zzzz|"C"zzzz|',
    ].join('\n'))
    tune.words = ['[Verse 1]', 'one', '[Chorus]', 'two', '[Verse 2]', 'three', '[Bridge]', 'four']

    const charts = await deleteSectionAt(tune, 2)

    expect(charts).toHaveLength(3)
    expect(charts.join('\n')).not.toMatch(/Am/)
    const notes = tune.voices[resolvePrimaryVoiceKey(tune.voices)].notes.join('\n')
    expect(notes).not.toMatch(/"Am"/)
  })

  test('chords-only song without lyrics', async function() {
    const tune = abcTools.abc2json([
      'X:1', 'T:Song', 'M:4/4', 'L:1/4', 'K:C',
      '"C"zzzz|"F"zzzz||"G"zzzz|"C"zzzz||"Am"zzzz|"F"zzzz|',
    ].join('\n'))

    const charts = await deleteSectionAt(tune, 1)

    expect(charts).toHaveLength(2)
    expect(charts.join('\n')).not.toMatch(/G/)
  })
})
