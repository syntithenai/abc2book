import Soundfont from 'soundfont-player'
import { getSoundfontPlayerHostname, isResolverMusyngKiteReady } from './soundFontConfig'
import { remapGmProgramToLocal } from './localSoundfontInstrumentMap'
import lookupInstrument from './midiInstrumentNames'

const instrumentCache = new WeakMap()

function cacheKey(ac, instrumentName, hostname) {
  return hostname + '::' + instrumentName
}

function getCacheForContext(ac) {
  if (!instrumentCache.has(ac)) {
    instrumentCache.set(ac, new Map())
  }
  return instrumentCache.get(ac)
}

export function getMidiSoundfontHostname(options) {
  return getSoundfontPlayerHostname(options)
}

export function gmProgramToSoundfontName(program, options) {
  const opts = options || {}
  const ready = opts.musyngKiteReady !== undefined
    ? !!opts.musyngKiteReady
    : isResolverMusyngKiteReady()
  const gmProgram = ready
    ? Math.floor(Number(program) || 0) % 128
    : remapGmProgramToLocal(program)
  return lookupInstrument(gmProgram) || 'acoustic_grand_piano'
}

export function buildSoundfontNameToUrl(hostname) {
  return function nameToUrl(name, soundfont, format) {
    const host = String(hostname || '').replace(/\/+$/g, '')
    if (host.endsWith('/' + soundfont) || host.endsWith(soundfont)) {
      return host + '/' + name + '-' + format + '.js'
    }
    return host + '/' + soundfont + '/' + name + '-' + format + '.js'
  }
}

/**
 * Load a GM instrument for MIDI file playback.
 * @param {AudioContext} ac
 * @param {number} gmProgram
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function loadMidiInstrument(ac, gmProgram, options) {
  const opts = options || {}
  if (!ac) {
    throw new Error('AudioContext is required')
  }
  const hostname = getMidiSoundfontHostname(opts)
  const instrumentName = gmProgramToSoundfontName(gmProgram, opts)
  const cache = getCacheForContext(ac)
  const key = cacheKey(ac, instrumentName, hostname)
  if (cache.has(key)) {
    return cache.get(key)
  }

  const instrument = await Soundfont.instrument(ac, instrumentName, {
    format: 'mp3',
    soundfont: 'MusyngKite',
    nameToUrl: buildSoundfontNameToUrl(hostname),
  })
  cache.set(key, instrument)
  return instrument
}

export async function loadMidiInstruments(ac, gmPrograms, options) {
  const programs = Array.isArray(gmPrograms) ? gmPrograms : []
  const unique = []
  programs.forEach(function(program) {
    const normalized = Math.floor(Number(program) || 0) % 128
    if (unique.indexOf(normalized) === -1) unique.push(normalized)
  })
  const instruments = await Promise.all(unique.map(function(program) {
    return loadMidiInstrument(ac, program, options)
  }))
  const byProgram = {}
  unique.forEach(function(program, index) {
    byProgram[program] = instruments[index]
  })
  return {
    list: instruments,
    byProgram: byProgram,
    resolve: function(program) {
      const normalized = Math.floor(Number(program) || 0) % 128
      return byProgram[normalized] || instruments[0] || null
    },
  }
}

export function stopInstrumentNotes(instrument) {
  if (instrument && typeof instrument.stop === 'function') {
    instrument.stop()
  }
}
