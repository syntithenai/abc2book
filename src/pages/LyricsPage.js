import React, { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Form,
  InputGroup,
  ListGroup,
  Spinner,
} from 'react-bootstrap'
import { buildCompactMeterSummary } from '../lyricsWordUtils'
import {
  collectReverseDictionaryCandidates,
  isMultiWordPhrase,
  lookupLookupHub,
  lookupReverseDictionary,
} from '../lyricsWordToolsApi'
import useMediaResolverHealth from '../useMediaResolverHealth'
import { LYRICS_TOOLS_CLOSE_MESSAGE } from '../embedFrameUtils'

function ResultPillList(props) {
  if (!props.items || props.items.length === 0) {
    return <div className="text-muted small">No results yet.</div>
  }

  return (
    <div className="d-flex flex-wrap gap-2">
      {props.items.map(function(item) {
        return (
          <Badge key={item.word + ':' + item.score} bg="light" text="dark" pill className="border">
            {item.word}
            {item.numSyllables ? ' . ' + item.numSyllables : ''}
          </Badge>
        )
      })}
    </div>
  )
}

function ReverseWordPicker(props) {
  const candidates = props.candidates || []
  if (!candidates.length) return null

  return (
    <div className="mb-3">
      <div className="text-muted small mb-2">Pick the word to look up:</div>
      <div className="d-flex flex-wrap gap-2">
        {candidates.map(function(item) {
          const isSelected = item.word === props.selectedWord
          return (
            <Button
              key={item.word + ':' + item.score}
              type="button"
              size="sm"
              variant={isSelected ? 'primary' : 'outline-secondary'}
              onClick={function() {
                if (props.onSelect) props.onSelect(item.word)
              }}
              disabled={props.loading}
              aria-pressed={isSelected}
            >
              {item.word}
            </Button>
          )
        })}
      </div>
    </div>
  )
}

function LookupSearchPanel(props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [reverseCandidates, setReverseCandidates] = useState([])
  const [selectedReverseWord, setSelectedReverseWord] = useState('')
  const [reverseResult, setReverseResult] = useState(null)
  const [activePhrase, setActivePhrase] = useState('')
  const query = props.query || ''
  const didAutoSearchRef = useRef(false)

  useEffect(function() {
    setError('')
    if (!query.trim()) {
      setResult(null)
      setReverseCandidates([])
      setSelectedReverseWord('')
      setReverseResult(null)
      setActivePhrase('')
    }
  }, [query])

  async function runHubLookup(term, selectedWord, cachedReverse) {
    const hub = await lookupLookupHub(term, props.accessToken, {
      selectedWord: selectedWord,
      reverseResult: cachedReverse,
    })
    setResult(hub)
    setReverseCandidates(hub.reverseCandidates || [])
    setSelectedReverseWord(hub.selectedReverseWord || selectedWord || '')
    if (props.onSearchComplete) props.onSearchComplete(term)
    return hub
  }

  async function runSearch(nextQuery, selectedWordOverride) {
    const term = String(nextQuery || '').trim()
    if (!term) {
      setError('Enter a word or phrase to search.')
      setResult(null)
      setReverseCandidates([])
      setSelectedReverseWord('')
      setReverseResult(null)
      setActivePhrase('')
      return
    }

    setLoading(true)
    setError('')
    setActivePhrase(term)

    try {
      if (isMultiWordPhrase(term)) {
        let reverse = reverseResult
        if (!reverse || activePhrase !== term) {
          reverse = await lookupReverseDictionary(term, props.accessToken)
          setReverseResult(reverse)
        }
        const candidates = collectReverseDictionaryCandidates(reverse)
        const selected = selectedWordOverride
          || (candidates[0] && candidates[0].word)
          || ''
        setReverseCandidates(candidates)
        setSelectedReverseWord(selected)
        await runHubLookup(term, selected, reverse)
      } else {
        setReverseCandidates([])
        setSelectedReverseWord('')
        setReverseResult(null)
        const hub = await lookupLookupHub(term, props.accessToken)
        setResult(hub)
        if (props.onSearchComplete) props.onSearchComplete(term)
      }
    } catch (searchError) {
      setError(searchError && searchError.message ? searchError.message : 'Search failed')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  async function handleSelectReverseWord(word) {
    if (!activePhrase || word === selectedReverseWord) return
    setSelectedReverseWord(word)
    setLoading(true)
    setError('')
    try {
      await runHubLookup(activePhrase, word, reverseResult)
    } catch (searchError) {
      setError(searchError && searchError.message ? searchError.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(function() {
    if (!props.autoSearch || didAutoSearchRef.current) return undefined
    const term = String(query || '').trim()
    if (!term) return undefined
    didAutoSearchRef.current = true
    runSearch(term)
  }, [props.autoSearch, query])

  function handleSubmit(event) {
    event.preventDefault()
    runSearch(query)
  }

  function handleClear() {
    setError('')
    setResult(null)
    setReverseCandidates([])
    setSelectedReverseWord('')
    setReverseResult(null)
    setActivePhrase('')
    if (props.onQueryChange) props.onQueryChange('')
  }

  return (
    <Card className="shadow-sm h-100 border-0 bg-body-tertiary">
      <Card.Body>
        <Card.Title as="h2" className="h4 mb-1">
          {props.title}
        </Card.Title>
        <Card.Text className="text-muted">{props.description}</Card.Text>

        <Form onSubmit={handleSubmit} className="mb-3">
          <InputGroup>
            <Button
              type="button"
              variant="outline-danger"
              onClick={handleClear}
              disabled={!query}
              aria-label="Clear search"
              title="Clear search"
            >
              x
            </Button>
            <Form.Control
              value={query}
              onChange={function(event) {
                if (props.onQueryChange) props.onQueryChange(event.target.value)
              }}
              placeholder={props.placeholder}
              aria-label={props.title + ' query'}
            />
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? <Spinner animation="border" size="sm" /> : 'Search'}
            </Button>
          </InputGroup>
        </Form>

        <ReverseWordPicker
          candidates={reverseCandidates}
          selectedWord={selectedReverseWord}
          loading={loading}
          onSelect={handleSelectReverseWord}
        />

        {error ? <Alert variant="warning" className="py-2">{error}</Alert> : null}
        {loading ? <div className="text-muted small mb-3">Searching word tools...</div> : null}
        {props.renderResult ? props.renderResult(result, query) : null}
      </Card.Body>
    </Card>
  )
}

function DictionaryResult(props) {
  if (!props.result || !props.result.length) {
    return <div className="text-muted small">Search for a word to see definitions and examples.</div>
  }

  const query = props.query || ''
  const resolvedWord = props.resolvedWord || (props.result[0] && props.result[0].word) || ''
  const showFuzzyNote = props.dictionaryMatch === 'fuzzy'
    && query
    && resolvedWord
    && resolvedWord.toLowerCase() !== query.toLowerCase()

  return (
    <div className="d-grid gap-3">
      {showFuzzyNote ? (
        <Alert variant="info" className="py-2 mb-0">
          No exact dictionary match for &ldquo;{query}&rdquo;. Showing &ldquo;{resolvedWord}&rdquo;
          {props.matchedSuggestion ? ' (closest match)' : ''}.
        </Alert>
      ) : null}
      {props.result.slice(0, 3).map(function(entry) {
        return (
          <Card key={entry.word}>
            <Card.Body>
              <div className="d-flex flex-wrap justify-content-between gap-2 align-items-start mb-2">
                <div>
                  <div className="h5 mb-0">{entry.word}</div>
                  <div className="text-muted small">{entry.phonetic || ''}</div>
                </div>
                <Badge bg="secondary">{entry.meanings.length} part{entry.meanings.length === 1 ? '' : 's'} of speech</Badge>
              </div>
              <div className="d-grid gap-2">
                {entry.meanings.slice(0, 3).map(function(meaning) {
                  return (
                    <div key={meaning.partOfSpeech}>
                      <div className="fw-semibold small text-uppercase text-muted">{meaning.partOfSpeech}</div>
                      <ListGroup variant="flush">
                        {meaning.definitions.slice(0, 2).map(function(definition) {
                          return (
                            <ListGroup.Item key={definition.definition} className="px-0 bg-transparent border-0 py-1">
                              {definition.definition}
                              {definition.example ? <div className="text-muted small">Example: {definition.example}</div> : null}
                            </ListGroup.Item>
                          )
                        })}
                      </ListGroup>
                    </div>
                  )
                })}
              </div>
            </Card.Body>
          </Card>
        )
      })}
    </div>
  )
}

function CompactMeterSummary(props) {
  const summary = buildCompactMeterSummary(props.phrase || '')
  if (!summary) return null
  return <div className="text-muted small mb-3">{summary}</div>
}

function renderListGroup(items) {
  return <ResultPillList items={items || []} />
}

function ExpandableSection(props) {
  const [isExpanded, setIsExpanded] = useState(true)
  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-2" onClick={function() { setIsExpanded(!isExpanded) }} style={{ userSelect: 'none', cursor: 'pointer' }}>
        <span style={{ fontSize: '0.9em', minWidth: '1.2em', textAlign: 'center', display: 'inline-block' }}>
          {isExpanded ? '▼' : '▶'}
        </span>
        <div className="fw-semibold">{props.title}</div>
      </div>
      {isExpanded ? <div className="ms-3">{props.children}</div> : null}
    </div>
  )
}

export default function LyricsPage(props) {
  const [searchParams, setSearchParams] = useSearchParams()
  const accessToken = props.token || ''
  const [lookupQuery, setLookupQuery] = useState(searchParams.get('q') || searchParams.get('toolQ') || '')
  const { available: resolverAvailable, checked: resolverChecked } = useMediaResolverHealth()
  const embedded = searchParams.get('embed') === '1'

  useEffect(function() {
    setLookupQuery(searchParams.get('q') || searchParams.get('toolQ') || '')
  }, [searchParams])

  useEffect(function() {
    const tab = String(searchParams.get('tab') || 'lookup').toLowerCase()
    if (tab === 'lookup') return
    const nextParams = new URLSearchParams(searchParams)
    if (embedded) nextParams.set('embed', '1')
    else nextParams.delete('embed')
    nextParams.set('tab', 'lookup')
    setSearchParams(nextParams, { replace: true })
  }, [embedded, searchParams, setSearchParams])

  useEffect(function() {
    if (!embedded) return undefined
    function onKeyDown(event) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      try {
        window.parent.postMessage({ type: LYRICS_TOOLS_CLOSE_MESSAGE }, window.location.origin)
      } catch (e) {
        // Ignore cross-origin postMessage failures.
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return function() {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [embedded])

  function withEmbedParam(nextParams) {
    if (embedded) nextParams.set('embed', '1')
    else nextParams.delete('embed')
    return nextParams
  }

  function updateLookupQuery(nextQuery) {
    const value = String(nextQuery || '')
    setLookupQuery(value)
    const nextParams = withEmbedParam(new URLSearchParams(searchParams))
    nextParams.set('tab', 'lookup')
    if (value) {
      nextParams.set('q', value)
      nextParams.set('toolQ', value)
    } else {
      nextParams.delete('q')
      nextParams.delete('toolQ')
    }
    setSearchParams(nextParams, { replace: true })
  }

  return (
    <Container className={embedded ? 'py-2 lyrics-page-embedded' : 'py-3'}>
      {!embedded ? (
        <div className="mb-4">
          <h1 className="mb-2">Lyrics</h1>
          <p className="text-muted mb-3" style={{ maxWidth: '60rem' }}>
            Songwriter tools for finding words that fit meaning, sound, and meter. Search a word or describe an idea
            to look up definitions, synonyms, alliteration, and rhymes together.
          </p>
        </div>
      ) : null}

      {!resolverChecked ? (
        <Card className="shadow-sm border-0">
          <Card.Body className="text-muted">Checking media resolver...</Card.Body>
        </Card>
      ) : null}

      {resolverChecked && !resolverAvailable ? (
        <Alert variant="warning" className="mb-0">
          Lyrics tools are available only when the media resolver is running and reachable.
        </Alert>
      ) : null}

      {resolverChecked && resolverAvailable ? (
      <Card className="shadow-sm border-0">
        <Card.Body>
          <LookupSearchPanel
            title="Lookup"
            description="One search across dictionary, thesaurus, alliteration, and rhyme finder. Multi-word searches are interpreted as ideas—pick the best matching word below."
            placeholder="Search a word or describe an idea, like bittersweet and glowing"
            query={lookupQuery}
            accessToken={accessToken}
            autoSearch={embedded && !!lookupQuery.trim()}
            onQueryChange={function(nextQuery) { updateLookupQuery(nextQuery) }}
            onSearchComplete={function(term) { updateLookupQuery(term) }}
            renderResult={function(result, currentQuery) {
              if (!result) return <div className="text-muted small">Search to load definitions, synonyms, alliteration, and rhymes.</div>
              const meterPhrase = result.query || currentQuery || ''
              return (
                <div className="d-grid gap-4">
                  <CompactMeterSummary phrase={meterPhrase} />
                  <ExpandableSection
                    title="Dictionary"
                  >
                    <DictionaryResult
                      result={result.dictionary}
                      query={result.query}
                      resolvedWord={result.resolvedWord}
                      dictionaryMatch={result.dictionaryMatch}
                      matchedSuggestion={result.matchedSuggestion}
                    />
                  </ExpandableSection>
                  {result.dictionaryMatch === 'fuzzy' && result.resolvedWord ? (
                    <div className="text-muted small">
                      Thesaurus results use &ldquo;{result.resolvedWord}&rdquo;.
                      Alliteration and rhymes use your original search text so made-up words still work.
                    </div>
                  ) : null}
                  <ExpandableSection
                    title="Thesaurus"
                  >
                    <div className="d-grid gap-3">
                      <div>
                        <div className="fw-semibold mb-2">Synonyms</div>
                        {renderListGroup(result.thesaurus && result.thesaurus.synonyms)}
                      </div>
                      <div>
                        <div className="fw-semibold mb-2">Antonyms</div>
                        {renderListGroup(result.thesaurus && result.thesaurus.antonyms)}
                      </div>
                      <div>
                        <div className="fw-semibold mb-2">Related</div>
                        {renderListGroup(result.thesaurus && result.thesaurus.related)}
                      </div>
                    </div>
                  </ExpandableSection>
                  <ExpandableSection
                    title="Alliteration"
                  >
                    <div className="d-grid gap-3">
                      <div>
                        <div className="fw-semibold mb-2">Alliterative adjectives</div>
                        {renderListGroup(result.alliteration && result.alliteration.alliterative)}
                      </div>
                      <div>
                        <div className="fw-semibold mb-2">More related adjectives</div>
                        {renderListGroup(result.alliteration && result.alliteration.related)}
                      </div>
                    </div>
                  </ExpandableSection>
                  <ExpandableSection
                    title="Rhyme Finder"
                  >
                    <div className="d-grid gap-3">
                      <div>
                        <div className="fw-semibold mb-2">Perfect rhymes</div>
                        {renderListGroup(result.rhyme && result.rhyme.perfect)}
                      </div>
                      <div>
                        <div className="fw-semibold mb-2">Near rhymes</div>
                        {renderListGroup(result.rhyme && result.rhyme.near)}
                      </div>
                      <div>
                        <div className="fw-semibold mb-2">Sound-alikes</div>
                        {renderListGroup(result.rhyme && result.rhyme.soundsLike)}
                      </div>
                    </div>
                  </ExpandableSection>
                </div>
              )
            }}
          />
        </Card.Body>
      </Card>
      ) : null}
    </Container>
  )
}
