import { useEffect, useState } from 'react'
import { Button, Col, Form, Modal, Row } from 'react-bootstrap'
import { Link } from 'react-router-dom'
import { PRACTICE_INSTRUMENTS, normalizeSuitableInstruments } from '../practiceSessionSettings'
import { TABLATURE_INSTRUMENT_OPTIONS } from '../tablatureConfig'
import { getPlainLyricLines, setPlainLyricLines } from '../wLinesUtils'
import { EDITOR_INFO_FIELD_HELP } from '../formFieldHelpText'
import { FormLabelWithHelp } from './FormFieldHelp'
import LinksEditor from './LinksEditor'
import TuneAliasesField from './TuneAliasesField'
import TuneArtistsField from './TuneArtistsField'
import ComposerSearchButton from './ComposerSearchButton'
import FieldLookupReviewButton from './FieldLookupReviewButton'
import CapitalizeTitleButton from './CapitalizeTitleButton'
import VoiceFillInput from './VoiceFillInput'
import KeySignatureInput from './KeySignatureInput'

function cloneTune(tune) {
  return tune ? JSON.parse(JSON.stringify(tune)) : null
}

function mergeDraftWithAbc(draft, abcText, tunebook, lyricsText) {
  const fromAbc = tunebook.abcTools.abc2json(abcText)
  const saved = Object.assign({}, fromAbc, draft, {
    id: draft.id,
    voices: fromAbc.voices,
    links: draft.links,
    backgroundInfo: draft.backgroundInfo,
    suitableFor: draft.suitableFor,
    suitableForPractice: draft.suitableForPractice,
    boost: draft.boost,
    difficulty: draft.difficulty,
    srcUrl: draft.srcUrl,
    tablature: draft.tablature,
    soundFonts: draft.soundFonts,
    tuning: draft.tuning,
    transpose: draft.transpose,
    capo: draft.capo,
    genre: draft.genre,
    aliases: draft.aliases,
    artists: draft.artists,
    tags: draft.tags,
    books: draft.books,
    type: draft.type,
  })
  setPlainLyricLines(saved, lyricsText.split('\n'))
  return saved
}

export default function BulkCheckTuneEditorModal(props) {
  const [draft, setDraft] = useState(null)
  const [abcText, setAbcText] = useState('')
  const [lyricsText, setLyricsText] = useState('')

  useEffect(function() {
    if (!props.show || !props.tune) {
      setDraft(null)
      setAbcText('')
      setLyricsText('')
      return
    }
    const next = cloneTune(props.tune)
    setDraft(next)
    setAbcText(props.tunebook.abcTools.json2abc(next))
    setLyricsText(getPlainLyricLines(next).join('\n'))
  }, [props.show, props.tune, props.tunebook])

  function updateDraft(patch) {
    setDraft(function(prev) {
      return Object.assign({}, prev, patch)
    })
  }

  function handleClose() {
    props.onClose()
  }

  function handleSave() {
    if (!draft || !props.tunebook) {
      handleClose()
      return
    }
    try {
      const saved = mergeDraftWithAbc(draft, abcText, props.tunebook, lyricsText)
      props.tunebook.saveTune(saved, false, { historyLabel: 'Bulk check edit', immediate: true })
      if (props.forceRefresh) props.forceRefresh()
      if (props.onSaved) props.onSaved(saved.id)
    } catch (e) {
      window.alert(e && e.message ? e.message : 'Could not save ABC notation.')
      return
    }
    handleClose()
  }

  if (!draft) return null

  const suitableFor = normalizeSuitableInstruments(draft.suitableFor)
  const meterOptions = props.tunebook.abcTools.getTimeSignatureTypes()
  const rhythmOptions = Object.keys(props.tunebook.abcTools.getRhythmTypes())

  return (
    <Modal show={props.show} onHide={handleClose} fullscreen scrollable className="bulk-check-editor-modal">
      <Modal.Header closeButton>
        <Modal.Title>Edit tune — {draft.name || 'Untitled Song'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form className="bulk-check-editor-form abc-editor-info-form">
          <div className="abc-editor-info-section">
            <div className="abc-editor-info-section-heading">Basic</div>
            <Row className="g-3">
              <Col md={6}>
                <Form.Group className="mb-3">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em', flexWrap: 'wrap', marginBottom: '0.35em' }}>
                    <Form.Label style={{ marginBottom: 0 }}>Title</Form.Label>
                    <CapitalizeTitleButton
                      value={draft.name}
                      onCapitalize={function(next) { updateDraft({ name: next }) }}
                    />
                  </div>
                  <VoiceFillInput
                    value={draft.name || ''}
                    onChange={function(e) { updateDraft({ name: e.target.value }) }}
                    fieldKind="title"
                    token={props.token}
                    setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em', flexWrap: 'wrap', marginBottom: '0.35em' }}>
                    <Form.Label style={{ marginBottom: 0 }}>Composer</Form.Label>
                    <ComposerSearchButton
                      tuneId={props.tune && props.tune.id}
                      title={draft.name || ''}
                      composer={draft.composer || ''}
                      titleHint={draft.name || ''}
                      token={props.token}
                      tunebook={props.tunebook}
                      disabled={!(draft.name && String(draft.name).trim())}
                      inline={true}
                      onComposer={function(result) {
                        if (result && result.artist) updateDraft({ composer: result.artist })
                      }}
                    />
                    <FieldLookupReviewButton
                      tuneId={props.tune && props.tune.id}
                      kind="composer"
                      fallbackTitle={draft.name || ''}
                      currentValue={draft.composer || ''}
                      onApply={function(candidate, _job, meta) {
                        if (meta && (meta.deferred || meta.keepCurrent)) return
                        if (candidate && candidate.artist) updateDraft({ composer: candidate.artist })
                      }}
                    />
                  </div>
                  <VoiceFillInput
                    value={draft.composer || ''}
                    onChange={function(e) { updateDraft({ composer: e.target.value }) }}
                    fieldKind="composer"
                    token={props.token}
                    setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                  />
                </Form.Group>
              </Col>
              <Col xs={12} md={6}>
                <TuneArtistsField
                  value={draft.artists}
                  onChange={function(artists) { updateDraft({ artists: artists }) }}
                />
              </Col>
              <Col xs={12} md={6}>
                <TuneAliasesField
                  value={draft.aliases}
                  onChange={function(aliases) { updateDraft({ aliases: aliases }) }}
                />
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <FormLabelWithHelp label="Genre" helpBody={EDITOR_INFO_FIELD_HELP.genre.body} helpTitle={EDITOR_INFO_FIELD_HELP.genre.title} />
                  <VoiceFillInput
                    value={draft.genre || ''}
                    onChange={function(e) { updateDraft({ genre: e.target.value }) }}
                    fieldKind="search"
                    token={props.token}
                    setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Type</Form.Label>
                  <VoiceFillInput
                    value={draft.type || ''}
                    onChange={function(e) { updateDraft({ type: e.target.value }) }}
                    placeholder="e.g. song, reel"
                    fieldKind="search"
                    token={props.token}
                    setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                  />
                </Form.Group>
              </Col>
            </Row>
          </div>

          <div className="abc-editor-info-section abc-editor-info-section-primary">
            <div className="abc-editor-info-section-heading">Notation</div>
            <Row className="g-3">
              <Col md={3}>
                <Form.Group className="mb-3">
                  <Form.Label>Key</Form.Label>
                  <KeySignatureInput
                    value={draft.key || ''}
                    onChange={function(next) { updateDraft({ key: next }) }}
                  />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group className="mb-3">
                  <FormLabelWithHelp label="Tuning" helpBody={EDITOR_INFO_FIELD_HELP.tuning.body} helpTitle={EDITOR_INFO_FIELD_HELP.tuning.title} />
                  <Form.Control
                    value={draft.tuning || ''}
                    onChange={function(e) { updateDraft({ tuning: e.target.value }) }}
                  />
                  {draft.id ? (
                    <Link to={'/tuner?tuneId=' + encodeURIComponent(draft.id)} className="small">Open tuner</Link>
                  ) : null}
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group className="mb-3">
                  <FormLabelWithHelp label="Transpose" helpBody={EDITOR_INFO_FIELD_HELP.transpose.body} helpTitle={EDITOR_INFO_FIELD_HELP.transpose.title} />
                  <Form.Control
                    value={draft.transpose != null && draft.transpose !== '' ? draft.transpose : ''}
                    onChange={function(e) { updateDraft({ transpose: e.target.value }) }}
                  />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group className="mb-3">
                  <FormLabelWithHelp label="Capo" helpBody={EDITOR_INFO_FIELD_HELP.capo.body} helpTitle={EDITOR_INFO_FIELD_HELP.capo.title} />
                  <Form.Control
                    type="number"
                    min="0"
                    max="12"
                    value={draft.capo != null && draft.capo !== '' ? draft.capo : ''}
                    onChange={function(e) {
                      const value = e.target.value === '' ? 0 : parseInt(e.target.value, 10)
                      updateDraft({ capo: Number.isFinite(value) ? value : 0 })
                    }}
                  />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group className="mb-3">
                  <Form.Label>Time signature</Form.Label>
                  <Form.Select
                    value={draft.meter || ''}
                    onChange={function(e) { updateDraft({ meter: e.target.value }) }}
                  >
                    <option value="">—</option>
                    {meterOptions.map(function(type) {
                      return <option key={type} value={type}>{type}</option>
                    })}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group className="mb-3">
                  <FormLabelWithHelp label="Rhythm" helpBody={EDITOR_INFO_FIELD_HELP.rhythm.body} helpTitle={EDITOR_INFO_FIELD_HELP.rhythm.title} />
                  <Form.Select
                    value={draft.rhythm || ''}
                    onChange={function(e) {
                      const rhythm = e.target.value
                      const meterFromRhythm = props.tunebook.abcTools.timeSignatureFromTuneType(rhythm)
                      updateDraft({
                        rhythm: rhythm,
                        meter: meterFromRhythm || draft.meter,
                      })
                    }}
                  >
                    <option value="">—</option>
                    {rhythmOptions.map(function(type) {
                      return <option key={type} value={type}>{type}</option>
                    })}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group className="mb-3">
                  <Form.Label>Tempo</Form.Label>
                  <Form.Control
                    type="number"
                    value={draft.tempo != null && draft.tempo !== '' ? draft.tempo : ''}
                    onChange={function(e) { updateDraft({ tempo: e.target.value }) }}
                  />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group className="mb-3">
                  <FormLabelWithHelp label="Repeats" helpBody={EDITOR_INFO_FIELD_HELP.repeats.body} helpTitle={EDITOR_INFO_FIELD_HELP.repeats.title} />
                  <Form.Control
                    type="number"
                    value={draft.repeats != null && draft.repeats !== '' ? draft.repeats : ''}
                    onChange={function(e) { updateDraft({ repeats: e.target.value }) }}
                  />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group className="mb-3">
                  <FormLabelWithHelp label="ABC Note Length" helpBody={EDITOR_INFO_FIELD_HELP.noteLength.body} helpTitle={EDITOR_INFO_FIELD_HELP.noteLength.title} />
                  <Form.Select
                    value={draft.noteLength || ''}
                    onChange={function(e) { updateDraft({ noteLength: e.target.value }) }}
                  >
                    <option value="">—</option>
                    <option value="1">1</option>
                    <option value="1/2">1/2</option>
                    <option value="1/3">1/3</option>
                    <option value="1/4">1/4</option>
                    <option value="1/6">1/6</option>
                    <option value="1/8">1/8</option>
                    <option value="1/12">1/12</option>
                    <option value="1/16">1/16</option>
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>
          </div>

          <div className="abc-editor-info-section abc-editor-info-section-practice">
            <div className="abc-editor-info-section-heading">Practice</div>
            <Row className="g-3">
              <Col xs={12} lg={4}>
                <Form.Group className="mb-3">
                  <FormLabelWithHelp label="Suitable for practice" helpBody={EDITOR_INFO_FIELD_HELP.suitableForPractice.body} helpTitle={EDITOR_INFO_FIELD_HELP.suitableForPractice.title} />
                  <Form.Check
                    type="checkbox"
                    label="Include in practice sessions"
                    checked={draft.suitableForPractice !== false}
                    onChange={function(e) { updateDraft({ suitableForPractice: !!e.target.checked }) }}
                  />
                </Form.Group>
              </Col>
              <Col xs={12} lg={8}>
                <Form.Group className="mb-3">
                  <FormLabelWithHelp label="Suitable for" helpBody={EDITOR_INFO_FIELD_HELP.suitableFor.body} helpTitle={EDITOR_INFO_FIELD_HELP.suitableFor.title} />
                  <div className="abc-editor-suitable-for">
                    {PRACTICE_INSTRUMENTS.map(function(item) {
                      const checked = suitableFor.indexOf(item.id) !== -1
                      return (
                        <Form.Check
                          inline
                          key={item.id}
                          type="checkbox"
                          label={item.label}
                          checked={checked}
                          onChange={function(e) {
                            const next = suitableFor.slice()
                            if (e.target.checked) {
                              if (next.indexOf(item.id) === -1) next.push(item.id)
                            } else {
                              const idx = next.indexOf(item.id)
                              if (idx !== -1) next.splice(idx, 1)
                            }
                            updateDraft({ suitableFor: next })
                          }}
                        />
                      )
                    })}
                  </div>
                </Form.Group>
              </Col>
            </Row>
          </div>

          <div className="abc-editor-info-section abc-editor-info-section-details">
            <div className="abc-editor-info-section-heading">Details</div>
            <Row className="g-3">
              <Col md={2}>
                <Form.Group className="mb-3">
                  <FormLabelWithHelp label="Confidence" helpBody={EDITOR_INFO_FIELD_HELP.boost.body} helpTitle={EDITOR_INFO_FIELD_HELP.boost.title} />
                  <Form.Control
                    type="number"
                    min="0"
                    max="20"
                    value={draft.boost != null && draft.boost !== '' ? draft.boost : ''}
                    onChange={function(e) { updateDraft({ boost: e.target.value }) }}
                  />
                </Form.Group>
              </Col>
              <Col md={2}>
                <Form.Group className="mb-3">
                  <FormLabelWithHelp label="Difficulty" helpBody={EDITOR_INFO_FIELD_HELP.difficulty.body} helpTitle={EDITOR_INFO_FIELD_HELP.difficulty.title} />
                  <Form.Control
                    type="number"
                    min="0"
                    max="20"
                    value={draft.difficulty != null && draft.difficulty !== '' ? draft.difficulty : ''}
                    onChange={function(e) { updateDraft({ difficulty: e.target.value }) }}
                  />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group className="mb-3">
                  <FormLabelWithHelp label="Tablature" helpBody={EDITOR_INFO_FIELD_HELP.tablature.body} helpTitle={EDITOR_INFO_FIELD_HELP.tablature.title} />
                  <Form.Select
                    value={draft.tablature ? String(draft.tablature).trim() : ''}
                    onChange={function(e) { updateDraft({ tablature: e.target.value }) }}
                  >
                    {TABLATURE_INSTRUMENT_OPTIONS.map(function(opt) {
                      return (
                        <option key={opt.value || '__none'} value={opt.value}>
                          {opt.value ? opt.label : '—'}
                        </option>
                      )
                    })}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={5}>
                <Form.Group className="mb-3">
                  <FormLabelWithHelp label="Sound Fonts" helpBody={EDITOR_INFO_FIELD_HELP.soundFonts.body} helpTitle={EDITOR_INFO_FIELD_HELP.soundFonts.title} />
                  <Form.Select
                    value={draft.soundFonts ? String(draft.soundFonts).trim() : ''}
                    onChange={function(e) { updateDraft({ soundFonts: e.target.value }) }}
                  >
                    <option value="">Auto (resolver MusyngKite when ready)</option>
                    <option value="local">Embedded instruments only</option>
                    <option value="online">Prefer full resolver bank</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col xs={12}>
                <Form.Group className="mb-3">
                  <FormLabelWithHelp label="Source URL" helpBody={EDITOR_INFO_FIELD_HELP.srcUrl.body} helpTitle={EDITOR_INFO_FIELD_HELP.srcUrl.title} />
                  <Form.Control
                    value={draft.srcUrl || ''}
                    onChange={function(e) { updateDraft({ srcUrl: e.target.value }) }}
                  />
                </Form.Group>
              </Col>
              <Col xs={12}>
                <Form.Group className="mb-3 abc-editor-info-background-group">
                  <FormLabelWithHelp
                    label="Background information (Markdown)"
                    helpBody={EDITOR_INFO_FIELD_HELP.backgroundInfo.body}
                    helpTitle={EDITOR_INFO_FIELD_HELP.backgroundInfo.title}
                  />
                  <Form.Control
                    as="textarea"
                    rows={8}
                    value={draft.backgroundInfo || ''}
                    onChange={function(e) { updateDraft({ backgroundInfo: e.target.value }) }}
                    placeholder="Performers, history, recordings, anecdotes... (Markdown supported)"
                  />
                </Form.Group>
              </Col>
            </Row>
          </div>

          <div className="abc-editor-info-section abc-editor-links-section mt-3 mb-4">
            <div className="abc-editor-info-section-heading">Links</div>
            <LinksEditor
              links={Array.isArray(draft.links) ? draft.links : []}
              tune={draft}
              tuneId={draft.id}
              tunebook={props.tunebook}
              abc={abcText}
              token={props.token}
              forceRefresh={props.forceRefresh}
              onChange={function(links) { updateDraft({ links: links }) }}
            />
          </div>

          <div className="abc-editor-info-section">
            <div className="abc-editor-info-section-heading">Lyrics</div>
            <Form.Group className="mb-3">
              <Form.Control
                as="textarea"
                rows={10}
                value={lyricsText}
                onChange={function(e) { setLyricsText(e.target.value) }}
              />
            </Form.Group>
          </div>

          <div className="abc-editor-info-section">
            <div className="abc-editor-info-section-heading">Raw ABC notation</div>
            <Form.Group className="mb-3">
              <Form.Control
                as="textarea"
                rows={16}
                className="bulk-check-editor-abc"
                value={abcText}
                onChange={function(e) { setAbcText(e.target.value) }}
                spellCheck={false}
              />
            </Form.Group>
          </div>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose}>Cancel</Button>
        <Button variant="primary" onClick={handleSave}>Save</Button>
      </Modal.Footer>
    </Modal>
  )
}
