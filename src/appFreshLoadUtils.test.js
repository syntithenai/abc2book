import {
  appendFreshLoadParam,
  beginFreshLoadFromShareLink,
  buildFreshRevertUrl,
  consumeFreshLoadAborted,
  finalizeFreshLoadIfReady,
  hasFreshLoadAttempt,
  isOffline,
  isShareImportRoute,
  prefersFreshAppLoad,
  readFreshParamFromLocation,
  revertFreshLoadAttempt,
  stripFreshParamFromLocation,
  PREFER_FRESH_APP_STORAGE_KEY,
  FRESH_LOAD_ATTEMPT_KEY,
  FRESH_LOAD_ABORTED_KEY,
} from './appFreshLoadUtils'

describe('appFreshLoadUtils', function() {
  const storage = {
    data: {},
    getItem(key) { return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : null },
    setItem(key, value) { this.data[key] = String(value) },
    removeItem(key) { delete this.data[key] },
    clear() { this.data = {} },
  }

  const session = {
    data: {},
    getItem(key) { return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : null },
    setItem(key, value) { this.data[key] = String(value) },
    removeItem(key) { delete this.data[key] },
    clear() { this.data = {} },
  }

  beforeEach(function() {
    storage.clear()
    session.clear()
  })

  test('readFreshParamFromLocation reads fresh=1 from search and hash', function() {
    expect(readFreshParamFromLocation({
      href: 'https://tunebook.net/?fresh=1#/importdoc/doc1',
      search: '?fresh=1',
      hash: '#/importdoc/doc1',
    })).toBe(true)

    expect(readFreshParamFromLocation({
      href: 'https://tunebook.net/#/importdoc/doc1?fresh=1',
      search: '',
      hash: '#/importdoc/doc1?fresh=1',
    })).toBe(true)

    expect(readFreshParamFromLocation({
      href: 'https://tunebook.net/#/importdoc/doc1',
      search: '',
      hash: '#/importdoc/doc1',
    })).toBe(false)
  })

  test('stripFreshParamFromLocation removes fresh from hash query', function() {
    expect(stripFreshParamFromLocation({
      href: 'https://tunebook.net/#/importdoc/doc1?fresh=1&embed=1',
      search: '',
      hash: '#/importdoc/doc1?fresh=1&embed=1',
      pathname: '/',
    })).toBe('/#/importdoc/doc1?embed=1')
  })

  test('appendFreshLoadParam appends fresh=1 once', function() {
    expect(appendFreshLoadParam('https://tunebook.net/#/importdoc/doc1'))
      .toBe('https://tunebook.net/#/importdoc/doc1?fresh=1')
    expect(appendFreshLoadParam('https://tunebook.net/#/audioanalysis/share/x?side=a'))
      .toBe('https://tunebook.net/#/audioanalysis/share/x?side=a&fresh=1')
    expect(appendFreshLoadParam('https://tunebook.net/#/importdoc/doc1?fresh=1'))
      .toBe('https://tunebook.net/#/importdoc/doc1?fresh=1')
  })

  test('beginFreshLoadFromShareLink reverts offline without touching cache preference', async function() {
    const location = {
      href: 'https://tunebook.net/#/importdoc/doc1?fresh=1',
      search: '',
      hash: '#/importdoc/doc1?fresh=1',
      pathname: '/',
    }
    const result = await beginFreshLoadFromShareLink({
      location: location,
      storage: storage,
      sessionStorage: session,
      isOffline: true,
    })

    expect(result.shouldNavigate).toBe(true)
    expect(result.revertUrl).toBe('/#/tunes')
    expect(result.cancelledImport).toBe(true)
    expect(prefersFreshAppLoad(storage)).toBe(false)
    expect(hasFreshLoadAttempt(session)).toBe(false)
    expect(consumeFreshLoadAborted(session)).toBe(true)
  })

  test('beginFreshLoadFromShareLink starts attempt online without changing cache', async function() {
    const location = {
      href: 'https://tunebook.net/#/importdoc/doc1?fresh=1',
      search: '',
      hash: '#/importdoc/doc1?fresh=1',
      pathname: '/',
    }
    const result = await beginFreshLoadFromShareLink({
      location: location,
      storage: storage,
      sessionStorage: session,
      isOffline: false,
    })

    expect(result.started).toBe(true)
    expect(result.shouldNavigate).toBe(false)
    expect(prefersFreshAppLoad(storage)).toBe(false)
    expect(hasFreshLoadAttempt(session)).toBe(true)
  })

  test('finalizeFreshLoadIfReady commits only after successful mount attempt', async function() {
    session.setItem(FRESH_LOAD_ATTEMPT_KEY, '1')
    const result = await finalizeFreshLoadIfReady({
      storage: storage,
      sessionStorage: session,
      location: {
        href: 'https://tunebook.net/#/importdoc/doc1?fresh=1',
        search: '',
        hash: '#/importdoc/doc1?fresh=1',
        pathname: '/',
      },
      isOffline: false,
    })

    expect(result.finalized).toBe(true)
    expect(prefersFreshAppLoad(storage)).toBe(true)
    expect(hasFreshLoadAttempt(session)).toBe(false)
    expect(result.cleanUrl).toBe('/#/importdoc/doc1')
  })

  test('finalizeFreshLoadIfReady reverts when offline at mount time', async function() {
    session.setItem(FRESH_LOAD_ATTEMPT_KEY, '1')
    const result = await finalizeFreshLoadIfReady({
      storage: storage,
      sessionStorage: session,
      location: {
        href: 'https://tunebook.net/#/importdoc/doc1?fresh=1',
        search: '',
        hash: '#/importdoc/doc1?fresh=1',
        pathname: '/',
      },
      isOffline: true,
    })

    expect(result.finalized).toBe(false)
    expect(result.reverted).toBe(true)
    expect(result.shouldNavigate).toBe(true)
    expect(result.revertUrl).toBe('/#/tunes')
    expect(prefersFreshAppLoad(storage)).toBe(false)
  })

  test('revertFreshLoadAttempt cancels import routes to tunes', async function() {
    const result = await revertFreshLoadAttempt({
      location: {
        href: 'https://tunebook.net/#/importdoc/doc1?fresh=1',
        hash: '#/importdoc/doc1?fresh=1',
        pathname: '/',
      },
      storage: storage,
      sessionStorage: session,
    })

    expect(result.shouldNavigate).toBe(true)
    expect(result.revertUrl).toBe('/#/tunes')
    expect(result.cancelledImport).toBe(true)
    expect(isShareImportRoute({ hash: '#/importdoc/doc1' })).toBe(true)
    expect(buildFreshRevertUrl({ pathname: '/' })).toBe('/#/tunes')
  })
})
