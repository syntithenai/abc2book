import {Button} from 'react-bootstrap'

export default function TempoControl(props) {
    
    
    return <span className="tempo-control">
        <label  id="tempo"  style={{float: 'left', marginRight: "0.2em"}} >
            {props.tunebook.icons.metronome}
          
            <select id="tempovalue" onChange={props.onChange} value={props.value} >
            <option value=""></option>
            <option value="30">Grave</option>
            <option value="42">Lento</option>
            <option value="47">Largo</option>
            <option value="60">Adagio</option>
            <option value="67">Adagietto</option>
            <option value="75">Andante</option>
            <option value="91">Moderato</option>
            <option value="104">Allegretto</option>
            <option value="120">Allegro</option>
            <option value="136">Vivace</option>
            <option value="170">Presto</option>
            <option value="180">Prestissimo</option>
          </select>
        </label>
      </span>

}
