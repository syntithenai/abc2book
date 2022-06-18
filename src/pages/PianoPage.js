import ResponsivePiano from '../components/ResponsivePiano'

export default function PianoPage(props) {
  var a=process.env.NODE_ENV === "development" ? 'http://localhost:4000/' : ''
   
  return (
    <ResponsivePiano soundFontUrl={a+"midi-js-soundfonts/selection/"} />
  );
}
