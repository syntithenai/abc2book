import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Container,
  Form,
  InputGroup,
  ListGroup,
  Row,
  Spinner,
  Tab,
  Tabs,
} from 'react-bootstrap'
import { analyzePhrase, buildSyllableSummary } from '../lyricsWordUtils'
import {
  lookupDictionary,
  lookupPhraseIdeas,
  lookupReverseDictionary,
  lookupRhymes,
  lookupThesaurus,
} from '../lyricsWordToolsApi'

function ToolCard(props) {
  return (
    <Card className="h-100 shadow-sm">
      <Card.Body>
        <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
          <Card.Title as="h3" className="h5 mb-0">
            {props.item.name}
          </Card.Title>
          <Badge bg="secondary" pill>
            {props.item.status}
          </Badge>
        </div>
        <Card.Text className="text-muted mb-0">
          {props.item.description}
        </Card.Text>
      </Card.Body>
    </Card>
  )
}

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
            {item.numSyllables ? ' · ' + item.numSyllables : ''}
          </Badge>
        )
      })}
    </div>
  )
}

function SearchPanel(props) {
  const [query, setQuery] = useState(props.initialQuery || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

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

  return (
    <Card className="shadow-sm h-100 border-0 bg-body-tertiary">
      <Card.Body>
        <Card.Title as="h2" className="h4 mb-1">
          {props.title}
        </Card.Title>
        <Card.Text className="text-muted">{props.description}</Card.Text>

        <Form onSubmit={handleSubmit} className="mb-3">
          <InputGroup>
            <Form.Control
              value={query}
              onChange={function(event) { setQuery(event.target.value) }}
              placeholder={props.placeholder}
              aria-label={props.title + ' query'}
            />
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? <Spinner animation="border" size="sm" /> : 'Search'}
            </Button>
          </InputGroup>
        </Form>

        {error ? <Alert variant="warning" className="py-2">{error}</Alert> : null}
        {loading ? <div className="text-muted small mb-3">Searching word tools…</div> : null}
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

const tabConfig = [
  { id: 'dictionary', title: 'Dictionary', description: 'Definitions, usage, and part of speech.' },
  { id: 'thesaurus', title: 'Thesaurus', description: 'Synonyms, antonyms, and related words.' },
  { id: 'rhyme', title: 'Rhyme Finder', description: 'Perfect and near rhymes for a lyric line.' },
  { id: 'meter', title: 'Syllables + Stress', description: 'Meter help for line writing and scansion.' },
  { id: 'reverse', title: 'Reverse Dictionary', description: 'Find the word from a description.' },
  { id: 'phrases', title: 'Phrase Finder', description: 'Collocations and adjacent word ideas.' },
]

const suggestionWords = ['heart', 'blue', 'river', 'fire', 'home', 'night']

export default function LyricsPage(props) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'dictionary')
  const accessToken = props.token || ''
  const [queries, setQueries] = useState({
    dictionary: searchParams.get('q') || '',
    thesaurus: '',
    rhyme: '',
    meter: searchParams.get('q') || '',
    reverse: '',
    phrases: '',
  })

  useEffect(function() {
    const nextTab = searchParams.get('tab') || 'dictionary'
    setActiveTab(nextTab)
  }, [searchParams])

  function updateTab(tabId) {
    const nextTab = tabId || 'dictionary'
    setActiveTab(nextTab)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('tab', nextTab)
    setSearchParams(nextParams, { replace: true })
  }

  function rememberQuery(tabId, query) {
    setQueries(function(previous) {
      return Object.assign({}, previous, { [tabId]: query })
    })
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('tab', tabId)
    nextParams.set('q', query)
    setSearchParams(nextParams, { replace: true })
  }

  return (
    <Container className="py-3">
      <div className="mb-4">
        <h1 className="mb-2">Lyrics</h1>
        <p className="text-muted mb-3" style={{ maxWidth: '60rem' }}>
          Songwriter tools for finding words that fit meaning, sound, and meter. Dictionary and thesaurus
          are the first working tools here, with rhyme, reverse lookup, and phrase ideas ready behind them.
        </p>
        <div className="d-flex flex-wrap gap-2 align-items-center">
          <span className="text-muted small">Try:</span>
          {suggestionWords.map(function(word) {
            return (
              <Button
                key={word}
                variant="outline-secondary"
                size="sm"
                onClick={function() {
                  updateTab('dictionary')
                  rememberQuery('dictionary', word)
                }}
              >
                {word}
              </Button>
            )
          })}
        </div>
      </div>

      <Row className="g-3 mb-4">
        {tabConfig.map(function(item) {
          return (
            <Col key={item.id} xs={12} md={6} xl={4}>
              <ToolCard
                item={{
                  name: item.title,
                  status: item.id === 'dictionary' || item.id === 'thesaurus' ? 'Live first' : 'Ready next',
                  description: item.description,
                }}
              />
            </Col>
          )
        })}
      </Row>

      <Card className="shadow-sm border-0">
        <Card.Body>
          <Tabs activeKey={activeTab} onSelect={function(eventKey) { updateTab(eventKey || 'dictionary') }} className="mb-3">
            <Tab eventKey="dictionary" title="Dictionary">
              <SearchPanel
                title="Dictionary"
                description="Look up definitions, usage examples, and pronunciation cues."
                placeholder="Search a word, like courage"
                initialQuery={queries.dictionary}
                onSearchComplete={function(term) { rememberQuery('dictionary', term) }}
                onSearch={function(term) { return lookupDictionary(term, accessToken) }}
                renderResult={function(result) { return <DictionaryResult result={result} /> }}
              />
            </Tab>
            <Tab eventKey="thesaurus" title="Thesaurus">
              <SearchPanel
                title="Thesaurus"
                description="Find synonyms, antonyms, and related word choices."
                placeholder="Search a word, like lonely"
                initialQuery={queries.thesaurus}
                onSearchComplete={function(term) { rememberQuery('thesaurus', term) }}
                onSearch={function(term) { return lookupThesaurus(term, accessToken) }}
                renderResult={function(result) {
                  if (!result) return <div className="text-muted small">Search for synonyms and antonyms.</div>
                  return (
                    <div className="d-grid gap-3">
                      <div>
                        <div className="fw-semibold mb-2">Synonyms</div>
                        {renderListGroup(result.synonyms)}
                      </div>
                      <div>
                        <div className="fw-semibold mb-2">Antonyms</div>
                        {renderListGroup(result.antonyms)}
                      </div>
                      <div>
                        <div className="fw-semibold mb-2">Related</div>
                        {renderListGroup(result.related)}
                      </div>
                    </div>
                  )
                }}
              />
            </Tab>
            <Tab eventKey="rhyme" title="Rhyme Finder">
              <SearchPanel
                title="Rhyme Finder"
                description="Perfect rhymes, near rhymes, and sound-alike options for lyric lines."
                placeholder="Search a word, like moon"
                initialQuery={queries.rhyme}
                onSearchComplete={function(term) { rememberQuery('rhyme', term) }}
                onSearch={function(term) { return lookupRhymes(term, accessToken) }}
                renderResult={function(result) {
                  if (!result) return <div className="text-muted small">Search for rhymes and slant rhymes.</div>
                  return (
                    <div className="d-grid gap-3">
                      <div>
                        <div className="fw-semibold mb-2">Perfect rhymes</div>
                        {renderListGroup(result.perfect)}
                      </div>
                      <div>
                        <div className="fw-semibold mb-2">Near rhymes</div>
                        {renderListGroup(result.near)}
                      </div>
                      <div>
                        <div className="fw-semibold mb-2">Sound-alikes</div>
                        {renderListGroup(result.soundsLike)}
                      </div>
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
                initialQuery={queries.meter}
                onSearchComplete={function(term) { rememberQuery('meter', term) }}
                onSearch={function(term) { return Promise.resolve({ analysis: analyzePhrase(term) }) }}
                renderResult={function(result, query) {
                  const analysis = result ? result.analysis : analyzePhrase(query)
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
                initialQuery={queries.reverse}
                onSearchComplete={function(term) { rememberQuery('reverse', term) }}
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
                initialQuery={queries.phrases}
                onSearchComplete={function(term) { rememberQuery('phrases', term) }}
                onSearch={function(term) { return lookupPhraseIdeas(term, accessToken) }}
                renderResult={function(result) {
                  if (!result) return <div className="text-muted small">Search for phrase neighbors and collocations.</div>
                  return (
                    <div className="d-grid gap-3">
                      <div>
                        <div className="fw-semibold mb-2">Words that follow this phrase</div>
                        {renderListGroup(result.leftContext)}
                      </div>
                      <div>
                        <div className="fw-semibold mb-2">Words that precede this phrase</div>
                        {renderListGroup(result.rightContext)}
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

      <div className="text-muted small mt-3">
        Meter summary helper: {buildSyllableSummary(queries.meter)}
      </div>
    </Container>
  )
}