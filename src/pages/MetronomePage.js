import Metronome from '@kevinorriss/react-metronome'

export default function MetronomePage(props) {
    return <div style={{width:'100%'}}>
        <h1>Metronome</h1>
        <div style={{width:'25%'}} >&nbsp;</div>
        <div style={{border:'2px solid blue',borderRadius:'10px', padding:'1em',width:'50%', textAlign:'center'}} ><Metronome/></div>
        <div style={{width:'25%'}} >&nbsp;</div>
    </div>
}
