import ResponsivePiano from '../components/ResponsivePiano'
import { resourceUrl } from '../resourceBase'

export default function PianoPage(props) {
  const soundFontUrl = resourceUrl('midi-js-soundfonts/selection/');

  return (
    <ResponsivePiano soundFontUrl={soundFontUrl} />
  );
}
