import React, { useEffect, useState } from 'react'
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
  Tab,
  Tabs,
} from 'react-bootstrap'
import { analyzePhrase, buildSyllableSummary } from '../lyricsWordUtils'
import {
  lookupAlliteration,
  lookupDictionary,
  lookupPhraseIdeas,
  lookupReverseDictionary,
  lookupRhymes,
  lookupThesaurus,
} from '../lyricsWordToolsApi'
import useMediaResolverHealth from '../useMediaResolverHealth'

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

function SearchPanel(props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const query = props.query || ''

  useEffect(function() {
    setError('')
    if (!query.trim()) {
      setResult(null)
    }
  }, [query])

  async function runSearch(nextQuery) {
    const term = String(nextQuery || '').trim()
    if (!term) {
      setError('Enter a word or phrase to search.')
      setResult(null)
      return
    }

    setLoading(true)
    setError('')
    try {
      const nextResult = await props.onSearch(term)
      setResult(nextResult)
      if (props.onSearchComplete) props.onSearchComplete(term)
    } catch (searchError) {
      setError(searchError && searchError.message ? searchError.message : 'Search failed')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    runSearch(query)
  }

  function handleClear() {
    setError('')
    setResult(null)
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

  return (
    <div className="d-grid gap-3">
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

function MeterResult(props) {
  const analysis = props.analysis || analyzePhrase('')
  if (!analysis.words.length) {
    return <div className="text-muted small">Type a line to estimate syllables and stress.</div>
  }

  return (
    <div className="d-grid gap-3">
      <Card>
        <Card.Body className="d-flex flex-wrap justify-content-between gap-3 align-items-start">
          <div>
            <div className="text-uppercase small text-muted">Total</div>
            <div className="h4 mb-0">{analysis.syllableCount} syllables</div>
          </div>
          <div>
            <div className="text-uppercase small text-muted">Stress shape</div>
            <div className="fw-semibold">{analysis.stressPattern}</div>
          </div>
        </Card.Body>
      </Card>
      <ListGroup>
        {analysis.wordAnalyses.map(function(item) {
          return (
            <ListGroup.Item key={item.word} className="d-flex flex-wrap justify-content-between gap-2 align-items-center">
              <div>
                <div className="fw-semibold">{item.word}</div>
                <div className="text-muted small">{item.stressPattern}</div>
              </div>
              <Badge bg="secondary">{item.syllableCount} syllable{item.syllableCount === 1 ? '' : 's'}</Badge>
            </ListGroup.Item>
          )
        })}
      </ListGroup>
    </div>
  )
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

const LEGACY_LOOKUP_TABS = new Set(['dictionary', 'thesaurus', 'alliteration', 'rhyme'])
const SUPPORTED_TABS = new Set(['lookup', 'meter', 'reverse', 'phrases'])

function normalizeTab(tabId) {
  const candidate = String(tabId || '').trim().toLowerCase()
  if (LEGACY_LOOKUP_TABS.has(candidate)) return 'lookup'
  if (SUPPORTED_TABS.has(candidate)) return candidate
  return 'lookup'
}

export default function LyricsPage(props) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState(normalizeTab(searchParams.get('tab') || 'lookup'))
  const accessToken = props.token || ''
  const [lookupQuery, setLookupQuery] = useState(searchParams.get('q') || '')
  const [toolQuery, setToolQuery] = useState(searchParams.get('toolQ') || '')
  const { available: resolverAvailable, checked: resolverChecked } = useMediaResolverHealth()

  useEffect(function() {
    const nextTab = normalizeTab(searchParams.get('tab') || 'lookup')
    setActiveTab(nextTab)
    setLookupQuery(searchParams.get('q') || '')
    setToolQuery(searchParams.get('toolQ') || '')
  }, [searchParams])

  function updateTab(tabId) {
    const nextTab = normalizeTab(tabId || 'lookup')
    setActiveTab(nextTab)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('tab', nextTab)
    setSearchParams(nextParams, { replace: true })
  }

  function updateLookupQuery(nextQuery) {
    const value = String(nextQuery || '')
    setLookupQuery(value)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('tab', 'lookup')
    if (value) {
      nextParams.set('q', value)
    } else {
      nextParams.delete('q')
    }
    setSearchParams(nextParams, { replace: true })
  }

  function updateToolQuery(nextQuery, tabId) {
    const value = String(nextQuery || '')
    const nextTab = normalizeTab(tabId || activeTab)
    setToolQuery(value)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('tab', nextTab)
    if (value) {
      nextParams.set('toolQ', value)
    } else {
      nextParams.delete('toolQ')
    }
    setSearchParams(nextParams, { replace: true })
  }

  return (
    <Container className="py-3">
      <div className="mb-4">
        <h1 className="mb-2">Lyrics</h1>
        <p className="text-muted mb-3" style={{ maxWidth: '60rem' }}>
          Songwriter tools for finding words that fit meaning, sound, and meter. Start with Lookup, then move through
          syllables, reverse lookup, and phrase ideas as needed.
        </p>
      </div>

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
          <Tabs activeKey={activeTab} onSelect={function(eventKey) { updateTab(eventKey || 'lookup') }} className="mb-3">
            <Tab eventKey="lookup" title="Lookup">
              <SearchPanel
                title="Lookup"
                description="One search across dictionary, thesaurus, alliteration, and rhyme finder."
                placeholder="Search a word, like courage"
                query={lookupQuery}
                onQueryChange={function(nextQuery) { updateLookupQuery(nextQuery) }}
                onSearchComplete={function(term) { updateLookupQuery(term) }}
                onSearch={async function(term) {
                  const [dictionary, thesaurus, alliteration, rhyme] = await Promise.all([
                    lookupDictionary(term, accessToken),
                    lookupThesaurus(term, accessToken),
                    lookupAlliteration(term, accessToken),
                    lookupRhymes(term, accessToken),
                  ])
                  return {
                    dictionary: dictionary,
                    thesaurus: thesaurus,
                    alliteration: alliteration,
                    rhyme: rhyme,
                  }
                }}
                renderResult={function(result) {
                  if (!result) return <div className="text-muted small">Search to load definitions, synonyms, alliteration, and rhymes.</div>
                  return (
                    <div className="d-grid gap-4">
                      <ExpandableSection 
                        title="Dictionary"
                      >
                        <DictionaryResult result={result.dictionary} />
                      </ExpandableSection>
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
            </Tab>
            <Tab eventKey="meter" title="Syllables + Stress">
              <SearchPanel
                title="Syllables + Stress"
                description="Quick meter help for line pacing and singability."
                placeholder="Enter a line, like blue moon on the water"
                query={toolQuery}
                onQueryChange={function(nextQuery) { updateToolQuery(nextQuery, 'meter') }}
                onSearchComplete={function(term) { updateToolQuery(term, 'meter') }}
                onSearch={function(term) { return Promise.resolve({ analysis: analyzePhrase(term) }) }}
                renderResult={function(result, currentQuery) {
                  const analysis = result ? result.analysis : analyzePhrase(currentQuery)
                  if (!analysis.words.length) return <div className="text-muted small">Type a line to estimate syllables and stress.</div>
                  return <MeterResult analysis={analysis} />
                }}
              />
            </Tab>
            <Tab eventKey="reverse" title="Reverse Dictionary">
              <SearchPanel
                title="Reverse Dictionary"
                description="Describe the idea you need, then get candidate words back."
                placeholder="Describe the feeling or image, like something bittersweet and glowing"
                query={toolQuery}
                onQueryChange={function(nextQuery) { updateToolQuery(nextQuery, 'reverse') }}
                onSearchComplete={function(term) { updateToolQuery(term, 'reverse') }}
                onSearch={function(term) { return lookupReverseDictionary(term, accessToken) }}
                renderResult={function(result) {
                  if (!result) return <div className="text-muted small">Search by idea or concept.</div>
                  return (
                    <div className="d-grid gap-3">
                      <div>
                        <div className="fw-semibold mb-2">Meaning matches</div>
                        {renderListGroup(result.meaning)}
                      </div>
                      <div>
                        <div className="fw-semibold mb-2">Topic matches</div>
                        {renderListGroup(result.topic)}
                      </div>
                      <div>
                        <div className="fw-semibold mb-2">Phrase-like matches</div>
                        {renderListGroup(result.examples)}
                      </div>
                    </div>
                  )
                }}
              />
            </Tab>
            <Tab eventKey="phrases" title="Phrase Finder">
              <SearchPanel
                title="Phrase Finder"
                description="Find common neighbors and phrase-level word ideas around a seed phrase."
                placeholder="Enter a phrase, like under the stars"
                query={toolQuery}
                onQueryChange={function(nextQuery) { updateToolQuery(nextQuery, 'phrases') }}
                onSearchComplete={function(term) { updateToolQuery(term, 'phrases') }}
                onSearch={function(term) { return lookupPhraseIdeas(term, accessToken) }}
                renderResult={function(result) {
                  if (!result) return <div className="text-muted small">Search for phrase neighbors and collocations.</div>
                  return (
                    <div className="d-grid gap-3">
                      <div>
                        <div className="fw-semibold mb-2">Words that follow this phrase</div>
                        {renderListGroup(result.followContext)}
                      </div>
                      <div>
                        <div className="fw-semibold mb-2">Words that precede this phrase</div>
                        {renderListGroup(result.precedeContext)}
                      </div>
                      <div>
                        <div className="fw-semibold mb-2">Related imagery and themes</div>
                        {renderListGroup(result.related)}
                      </div>
                      <div>
                        <div className="fw-semibold mb-2">Phrase-shaped suggestions</div>
                        {renderListGroup(result.spelling)}
                      </div>
                    </div>
                  )
                }}
              />
            </Tab>
          </Tabs>
        </Card.Body>
      </Card>
      ) : null}

      <div className="text-muted small mt-3">
        Meter summary helper: {buildSyllableSummary(toolQuery)}
      </div>
    </Container>
  )
}
