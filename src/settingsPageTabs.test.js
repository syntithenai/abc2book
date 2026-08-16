import {
  LIBRARY_TAB_LIBRARY,
  TAB_BACKGROUND_JOBS,
  TAB_BACKUP,
  TAB_LIBRARY,
  TAB_MEDIA,
  TAB_PERSONALISATION,
  TAB_SOURCES,
  buildSettingsHashPath,
  buildSettingsPath,
  legacySettingsRedirect,
  parseSettingsSplat,
  resolveSettingsLocation,
} from './settingsPageTabs'

describe('buildSettingsPath', function() {
  it('builds top-level settings paths', function() {
    expect(buildSettingsPath(TAB_BACKGROUND_JOBS)).toBe('/settings/background-jobs')
    expect(buildSettingsPath(TAB_PERSONALISATION)).toBe('/settings/personalisation')
  })

  it('omits the default library inner tab from the path', function() {
    expect(buildSettingsPath(TAB_LIBRARY, LIBRARY_TAB_LIBRARY)).toBe('/settings/library')
    expect(buildSettingsPath(TAB_LIBRARY, TAB_SOURCES)).toBe('/settings/library/sources')
    expect(buildSettingsPath(TAB_LIBRARY, TAB_MEDIA)).toBe('/settings/library/media')
  })

  it('keeps search params on hash paths', function() {
    expect(buildSettingsHashPath(TAB_BACKGROUND_JOBS, null, { jobsTab: 'research' })).toBe(
      '/#/settings/background-jobs?jobsTab=research'
    )
  })
})

describe('parseSettingsSplat', function() {
  it('defaults empty splat to background jobs', function() {
    expect(parseSettingsSplat('')).toEqual({
      tab: TAB_BACKGROUND_JOBS,
      libraryTab: LIBRARY_TAB_LIBRARY,
    })
  })

  it('reads nested library tabs', function() {
    expect(parseSettingsSplat('library')).toEqual({
      tab: TAB_LIBRARY,
      libraryTab: LIBRARY_TAB_LIBRARY,
    })
    expect(parseSettingsSplat('library/sources')).toEqual({
      tab: TAB_LIBRARY,
      libraryTab: TAB_SOURCES,
    })
    expect(parseSettingsSplat('library/media')).toEqual({
      tab: TAB_LIBRARY,
      libraryTab: TAB_MEDIA,
    })
  })
})

describe('resolveSettingsLocation', function() {
  it('maps audio to background jobs', function() {
    expect(resolveSettingsLocation('audio', null).tab).toBe(TAB_BACKGROUND_JOBS)
  })

  it('combines appearance, voice, and pedal under personalisation', function() {
    expect(resolveSettingsLocation('appearance', null).tab).toBe(TAB_PERSONALISATION)
    expect(resolveSettingsLocation('voice', null).tab).toBe(TAB_PERSONALISATION)
    expect(resolveSettingsLocation('pedal', null).tab).toBe(TAB_PERSONALISATION)
  })

  it('nests former top-level library tools', function() {
    expect(resolveSettingsLocation('sources', null)).toEqual({
      tab: TAB_LIBRARY,
      libraryTab: TAB_SOURCES,
    })
    expect(resolveSettingsLocation('backup', null)).toEqual({
      tab: TAB_LIBRARY,
      libraryTab: TAB_BACKUP,
    })
    expect(resolveSettingsLocation('media', null)).toEqual({
      tab: TAB_LIBRARY,
      libraryTab: TAB_MEDIA,
    })
    expect(resolveSettingsLocation('music-collection', null)).toEqual({
      tab: TAB_LIBRARY,
      libraryTab: TAB_SOURCES,
    })
    expect(resolveSettingsLocation('scale', null)).toEqual({
      tab: TAB_LIBRARY,
      libraryTab: LIBRARY_TAB_LIBRARY,
    })
  })

  it('defaults library to the library inner tab', function() {
    expect(resolveSettingsLocation('library', null)).toEqual({
      tab: TAB_LIBRARY,
      libraryTab: LIBRARY_TAB_LIBRARY,
    })
    expect(resolveSettingsLocation('library', 'backup')).toEqual({
      tab: TAB_LIBRARY,
      libraryTab: TAB_BACKUP,
    })
  })
})

describe('legacySettingsRedirect', function() {
  it('sends bare /settings to background jobs', function() {
    expect(legacySettingsRedirect('', new URLSearchParams())).toBe('/settings/background-jobs')
  })

  it('rewrites legacy tab query params to nested paths', function() {
    expect(legacySettingsRedirect('', new URLSearchParams('tab=sources'))).toBe('/settings/library/sources')
    expect(legacySettingsRedirect('', new URLSearchParams('tab=media'))).toBe('/settings/library/media')
    expect(legacySettingsRedirect('', new URLSearchParams('tab=providers&credit=1'))).toBe(
      '/settings/providers?credit=1'
    )
    expect(legacySettingsRedirect('', new URLSearchParams('tab=background-jobs&jobsTab=research'))).toBe(
      '/settings/background-jobs?jobsTab=research'
    )
  })

  it('leaves canonical nested paths alone', function() {
    expect(legacySettingsRedirect('library/media', new URLSearchParams())).toBe(null)
    expect(legacySettingsRedirect('providers', new URLSearchParams('credit=1'))).toBe(null)
  })
})
