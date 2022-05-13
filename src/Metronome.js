export default class Metronome
{
    constructor(tempo = 120, beatsPerBar=4, maxBeats = 0, callback)
    {
        this.audioContext = null;
        this.notesInQueue = [];         // notes that have been put into the web audio and may or may not have been played yet {note, time}
        this.currentBeatInBar = 0;
        this.beatsPerBar = beatsPerBar;
        this.tempo = tempo;
        this.lookahead = 25;          // How frequently to call scheduling function (in milliseconds)
        this.scheduleAheadTime = 0.1;   // How far ahead to schedule audio (sec)
        this.nextNoteTime = 0.0;     // when the next note is due
        this.isRunning = false;
        this.intervalID = null;
        this.maxBeats = maxBeats  // stop after this many beats and call callback
        this.callback = callback
        this.currentBeat = 0
    }

    nextNote()
    {
        // Advance current note and time by a quarter note (crotchet if you're posh)
        var secondsPerBeat = 60.0 / this.tempo; // Notice this picks up the CURRENT tempo value to calculate beat length.
        this.nextNoteTime += secondsPerBeat; // Add beat length to last beat time
    
        this.currentBeatInBar++;    // Advance the beat number, wrap to zero
        if (this.currentBeatInBar == this.beatsPerBar) {
            this.currentBeatInBar = 0;
        }
    }

    scheduleNote(beatNumber, time)
    {
        // push the note on the queue, even if we're not playing.
        this.notesInQueue.push({ note: beatNumber, time: time });
    
        // create an oscillator
        const osc = this.audioContext.createOscillator();
        const envelope = this.audioContext.createGain();
        
        osc.frequency.value = (beatNumber % this.beatsPerBar == 0) ? 1000 : 800;
        envelope.gain.value = 1;
        envelope.gain.exponentialRampToValueAtTime(1, time + 0.001);
        envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.02);

        osc.connect(envelope);
        envelope.connect(this.audioContext.destination);
    
        osc.start(time);
        osc.stop(time + 0.03);
        this.currentBeat += 1
        
    }

    scheduler()
    {
        if (this.maxBeats <= 0 || this.currentBeat < this.maxBeats) {
            // while there are notes that will need to play before the next interval, schedule them and advance the pointer.
            while ((this.maxBeats <= 0 || this.currentBeat < this.maxBeats) && this.nextNoteTime < this.audioContext.currentTime + this.scheduleAheadTime ) {
                //console.log('s',this.maxBeats,this.currentBeat)
                this.scheduleNote(this.currentBeatInBar, this.nextNoteTime);
                this.nextNote();
            }

        }  else {
            this.stop()
            this.callback()
        }
        
    }

    start()
    {
        if (!this.tempo > 0) return; 
        if (this.isRunning) return;

        if (this.audioContext == null)
        {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        this.isRunning = true;

        this.currentBeatInBar = 0;
        this.nextNoteTime = this.audioContext.currentTime + 0.05;

        this.intervalID = setInterval(() => this.scheduler(), this.lookahead);
    }

    stop()
    {
        this.isRunning = false;
        this.currentBeat = 0
        this.currentBeatInBar = 0
        this.notesInQueue = []
        this.nextNoteTime = 0.0;
        clearInterval(this.intervalID);
    }

    startStop()
    {
        if (this.isRunning) {
            this.stop();
        }
        else {
            this.start();
        }
    }
}
