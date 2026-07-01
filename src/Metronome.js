import { playMetronomeTick } from './metronomeTickSounds'
import { createRhythm, slotAccentLevel, slotsPerBar } from './metronomeRhythmPresets'

export default class Metronome
{
    constructor(audioContext, tempo = 120, beatsPerBar = 4, maxBeats = 0, callback, errorCallback, rhythm = null)
    {
        this.audioContext = audioContext;
        this.notesInQueue = [];
        this.currentSlotInBar = 0;
        this.tempo = tempo;
        this.lookahead = 25;
        this.scheduleAheadTime = 0.1;
        this.nextNoteTime = 0.0;
        this.isRunning = false;
        this.intervalID = null;
        this.maxBeats = maxBeats;
        this.callback = callback;
        this.errorCallback = errorCallback;
        this.currentBeat = 0;
        this.onSlotChange = null;

        this.setRhythm(rhythm || createRhythm(beatsPerBar));
    }

    setRhythm(rhythm) {
        this.rhythm = rhythm || createRhythm(4);
        this.beatsPerBar = this.rhythm.beatsPerBar;
        this.pulsesPerBeat = this.rhythm.pulsesPerBeat;
        this.accents = this.rhythm.accents;
    }

    setTempo(tempo) {
        this.tempo = tempo;
    }

    nextNote()
    {
        const secondsPerBeat = 60.0 / this.tempo;
        const secondsPerSlot = secondsPerBeat / this.pulsesPerBeat;
        this.nextNoteTime += secondsPerSlot;

        this.currentSlotInBar++;
        const totalSlots = slotsPerBar(this.rhythm);
        if (this.currentSlotInBar >= totalSlots) {
            this.currentSlotInBar = 0;
        }
    }

    scheduleNote(slotIndex, time)
    {
        this.notesInQueue.push({ slot: slotIndex, time: time });

        const accentLevel = slotAccentLevel(this.rhythm, slotIndex);
        playMetronomeTick(this.audioContext, time, accentLevel);

        if (this.onSlotChange) {
            this.onSlotChange(slotIndex, this.rhythm);
        }

        this.currentBeat += 1;
    }

    scheduler()
    {
        if (this.maxBeats <= 0 || this.currentBeat < this.maxBeats) {
            while ((this.maxBeats <= 0 || this.currentBeat < this.maxBeats) && this.nextNoteTime < this.audioContext.currentTime + this.scheduleAheadTime ) {
                this.scheduleNote(this.currentSlotInBar, this.nextNoteTime);
                this.nextNote();
            }
        } else {
            this.stop();
            if (this.callback) this.callback();
        }
    }

    start()
    {
        if (!(this.tempo > 0)) return;
        if (this.isRunning) return;

        if (this.audioContext == null)
        {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioContext.state === 'running') {
            this.beginScheduling();
        } else if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().then(() => {
                if (this.audioContext.state === 'running') {
                    this.beginScheduling();
                } else if (this.errorCallback) {
                    this.errorCallback();
                }
            }).catch(() => {
                if (this.errorCallback) this.errorCallback();
            });
        } else if (this.errorCallback) {
            this.errorCallback();
        }
    }

    beginScheduling()
    {
        if (this.isRunning) return;
        this.isRunning = true;
        this.currentSlotInBar = 0;
        this.nextNoteTime = this.audioContext.currentTime + 0.05;
        this.intervalID = setInterval(() => this.scheduler(), this.lookahead);
    }

    stop()
    {
        this.isRunning = false;
        this.currentBeat = 0;
        this.currentSlotInBar = 0;
        this.notesInQueue = [];
        this.nextNoteTime = 0.0;
        if (this.intervalID) {
            clearInterval(this.intervalID);
            this.intervalID = null;
        }
    }

    startStop()
    {
        if (this.isRunning) {
            this.stop();
        } else {
            this.start();
        }
    }
}
