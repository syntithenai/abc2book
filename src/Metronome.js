import { playRhythmSlot } from './rhythmSlotPlayback'
import { createRhythmConfig, normalizeRhythmConfig } from './rhythmEngineTypes'
import { slotBeatIndex, slotsPerBar } from './metronomeRhythmPresets'

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
        this.lastScheduledTime = 0;
        this.completionTimeoutId = null;

        this.setRhythm(rhythm || createRhythmConfig(beatsPerBar));
    }

    setRhythm(rhythm) {
        this.rhythm = normalizeRhythmConfig(rhythm || createRhythmConfig(4));
        this.beatsPerBar = this.rhythm.beatsPerBar;
        this.pulsesPerBeat = this.rhythm.pulsesPerBeat;
        this.accents = this.rhythm.accents;
        if (this.isRunning) {
            this.notesInQueue = [];
            this.currentSlotInBar = 0;
            if (this.audioContext) {
                this.nextNoteTime = this.audioContext.currentTime + 0.05;
            }
        }
    }

    setTempo(tempo) {
        const nextTempo = parseFloat(tempo);
        if (!(nextTempo > 0)) return;
        if (Math.abs(nextTempo - this.tempo) < 0.01) return;
        this.tempo = nextTempo;
        // Re-anchor the schedule so the new tempo applies on the next click
        // instead of waiting out intervals already computed at the old tempo.
        if (this.isRunning && this.audioContext) {
            const now = this.audioContext.currentTime;
            if (this.nextNoteTime > now + 0.02) {
                this.nextNoteTime = now + 0.02;
            }
        }
    }

    nextNote()
    {
        const secondsPerBeat = 60.0 / this.tempo;
        const beatIndex = slotBeatIndex(this.rhythm, this.currentSlotInBar);
        const pulsesForBeat = (this.rhythm.pulsesPerBeat && this.rhythm.pulsesPerBeat[beatIndex]) || 1;
        this.nextNoteTime += secondsPerBeat / pulsesForBeat;

        this.currentSlotInBar++;
        const totalSlots = slotsPerBar(this.rhythm);
        if (this.currentSlotInBar >= totalSlots) {
            this.currentSlotInBar = 0;
        }
    }

    scheduleNote(slotIndex, time)
    {
        this.notesInQueue.push({ slot: slotIndex, time: time });
        this.lastScheduledTime = time;

        playRhythmSlot(this.audioContext, time, this.rhythm, slotIndex);

        this.currentBeat += 1;
        if (this.currentBeat === 1 && typeof this.onFirstNoteSchedule === 'function') {
            this.onFirstNoteSchedule(time);
        }
    }

    flushAllVisuals() {
        if (!this.onSlotChange) {
            this.notesInQueue = []
            return
        }
        while (this.notesInQueue.length > 0) {
            const note = this.notesInQueue.shift()
            this.onSlotChange(note.slot, this.rhythm)
        }
    }

    finishCompletion(callback) {
        // Flush any clicks still waiting in the lookahead queue so UI
        // countdowns see every beat (including the last one).
        this.flushDueVisuals()
        this.flushAllVisuals()
        const cb = callback || this.callback
        this.stop()
        if (cb) cb()
    }

    scheduleCompletionCallback() {
        const callback = this.callback
        if (!callback) {
            this.stop()
            return
        }
        if (this.intervalID) {
            clearInterval(this.intervalID)
            this.intervalID = null
        }
        this.isRunning = false
        const tickTailSec = 0.03
        const fireAt = this.lastScheduledTime + tickTailSec
        const now = this.audioContext ? this.audioContext.currentTime : 0
        const delayMs = Math.max(0, (fireAt - now) * 1000)
        const self = this
        if (delayMs > 5) {
            this.completionTimeoutId = setTimeout(function() {
                self.completionTimeoutId = null
                self.finishCompletion(callback)
            }, delayMs)
        } else {
            this.finishCompletion(callback)
        }
    }

    flushDueVisuals()
    {
        if (!this.onSlotChange || !this.audioContext) return
        const now = this.audioContext.currentTime
        while (this.notesInQueue.length > 0 && this.notesInQueue[0].time <= now) {
            const note = this.notesInQueue.shift()
            this.onSlotChange(note.slot, this.rhythm)
        }
    }

    scheduler()
    {
        this.flushDueVisuals()

        if (this.maxBeats <= 0 || this.currentBeat < this.maxBeats) {
            while ((this.maxBeats <= 0 || this.currentBeat < this.maxBeats) && this.nextNoteTime < this.audioContext.currentTime + this.scheduleAheadTime ) {
                this.scheduleNote(this.currentSlotInBar, this.nextNoteTime);
                this.nextNote();
            }
        } else {
            this.flushDueVisuals()
            this.scheduleCompletionCallback()
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

    beginScheduling(startSlot)
    {
        if (this.isRunning) return;
        this.isRunning = true;
        const totalSlots = slotsPerBar(this.rhythm);
        const slot = startSlot !== undefined && startSlot !== null
            ? ((startSlot % totalSlots) + totalSlots) % totalSlots
            : 0;
        this.currentSlotInBar = slot;
        this.nextNoteTime = this.audioContext.currentTime + 0.05;
        this.intervalID = setInterval(() => this.scheduler(), this.lookahead);
    }

    alignToSlot(slotIndex, nextNoteTime) {
        if (!this.isRunning || !this.audioContext) return
        const totalSlots = slotsPerBar(this.rhythm)
        const slot = slotIndex !== undefined && slotIndex !== null
            ? ((slotIndex % totalSlots) + totalSlots) % totalSlots
            : this.currentSlotInBar
        this.currentSlotInBar = slot
        const now = this.audioContext.currentTime
        const next = parseFloat(nextNoteTime)
        this.nextNoteTime = Number.isFinite(next) && next > now
            ? next
            : now + 0.02
    }

    startAtSlot(slotIndex)
    {
        if (!(this.tempo > 0)) return;
        if (this.isRunning) return;

        if (this.audioContext == null)
        {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        const pendingSlot = slotIndex;
        if (this.audioContext.state === 'running') {
            this.beginScheduling(pendingSlot);
        } else if (this.audioContext.state === 'suspended') {
            const self = this;
            this.audioContext.resume().then(() => {
                if (self.audioContext.state === 'running') {
                    self.beginScheduling(pendingSlot);
                } else if (self.errorCallback) {
                    self.errorCallback();
                }
            }).catch(() => {
                if (self.errorCallback) self.errorCallback();
            });
        } else if (this.errorCallback) {
            this.errorCallback();
        }
    }

    stop()
    {
        this.isRunning = false;
        if (this.completionTimeoutId) {
            clearTimeout(this.completionTimeoutId);
            this.completionTimeoutId = null;
        }
        this.currentBeat = 0;
        this.currentSlotInBar = 0;
        this.notesInQueue = [];
        this.nextNoteTime = 0.0;
        this.lastScheduledTime = 0;
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
