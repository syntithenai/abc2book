import ResponsivePiano from '../components/ResponsivePiano'
import useMediaResolverHealth from '../useMediaResolverHealth'
import { getSoundfontPlayerHostname, isResolverMusyngKiteReady } from '../soundFontConfig'
import { LOCAL_SOUNDFONT_INSTRUMENTS } from '../localSoundfontInstrumentMap'
import GM_INSTRUMENT_NAMES from '../gmInstrumentNames'

export default function PianoPage(props) {
  const health = useMediaResolverHealth()
  const musyngReady = !!(health.available && health.status && health.status.soundfontsReady)
  const soundFontUrl = getSoundfontPlayerHostname({ musyngKiteReady: musyngReady })
  const instruments = musyngReady ? GM_INSTRUMENT_NAMES : LOCAL_SOUNDFONT_INSTRUMENTS

  return (
    <ResponsivePiano soundFontUrl={soundFontUrl} instruments={instruments} fullGm={musyngReady} />
  );
}
