'use strict';

import {TypedEventTarget} from './event.js';
import {
  ChannelControlMessage,
  ChannelControlType,
  NoteOff,
  NoteOn,
  parseMessage,
} from './message.js';
import {Selector} from './selector.js';
import {sleep} from './utils.js';

// See https://gbdev.io/pandocs/Audio.html for inspiration.

const GAIN_MULTIPLIER = 0.1;
const ONSET = 0.01;
const OFFSET = 0.2;
const INITIAL_OSCILLATORS = 15;

export type SimpleMIDIOutput = Pick<MIDIOutput, 'name' | 'send' | 'id'>;

class KeyGraph extends TypedEventTarget<{inactive: void}> {
  readonly oscillator: OscillatorNode;
  readonly gain: GainNode;
  private isPlaying = false;

  constructor(destination: AudioNode, type: OscillatorType) {
    super();
    this.oscillator = new OscillatorNode(destination.context, {type});
    this.gain = new GainNode(destination.context, {gain: 0});
    this.oscillator.connect(this.gain).connect(destination);
    this.oscillator.start();
  }

  start(frequency: number, gain: number, waveform?: OscillatorType) {
    if (this.isPlaying) {
      throw new Error('Already playing');
    }
    if (waveform && this.oscillator.type !== waveform) {
      this.oscillator.type = waveform;
    }
    this.oscillator.frequency.value = frequency;
    this.gain.gain.setTargetAtTime(
      gain,
      this.gain.context.currentTime,
      ONSET / 4
    );
    this.gain.gain.setTargetAtTime(0, this.gain.context.currentTime + ONSET, 2);
    this.isPlaying = true;
  }

  async stop(immediately = false) {
    const offset = immediately ? 1e-8 : OFFSET;
    this.gain.gain.setTargetAtTime(
      0,
      this.gain.context.currentTime,
      offset / 4
    );
    await sleep(offset);
    this.isPlaying = false;
    this.dispatchEvent('inactive');
  }
}

// TODO: Support different channels.
export class Synthesizer implements SimpleMIDIOutput {
  readonly name = 'Basic synth';
  readonly id = 'basic_js_synth';
  private readonly keyGraphs = new Map<number, KeyGraph>();
  private readonly gain: GainNode;
  private waveform: OscillatorType = 'triangle';
  private waveformSelector: Selector<OscillatorType> | null = null;
  private sustain: boolean = false;
  private readonly sustained = new Set<number>();
  private readonly inactiveKeyGraphs: KeyGraph[];

  constructor(
    private readonly context: AudioContext = new AudioContext(),
    selectElement?: HTMLSelectElement
  ) {
    this.gain = this.context.createGain();
    this.gain.connect(this.context.destination);
    this.inactiveKeyGraphs = Array.from(
      new Array(INITIAL_OSCILLATORS),
      () => new KeyGraph(this.gain, this.waveform)
    );

    if (this.context.state === 'suspended') {
      document.body.addEventListener(
        'click',
        () => {
          this.context.resume();
        },
        {once: true, passive: true}
      );
    }

    if (selectElement) {
      this.waveformSelector = new Selector<OscillatorType>(
        selectElement,
        ['triangle', 'sawtooth', 'square', 'sine'],
        this.waveform,
        (option) => option[0].toUpperCase() + option.substring(1)
      );
      this.waveformSelector.addEventListener('select', (option) => {
        if (option) {
          this.waveform = option;
        }
      });
    }
  }

  send(data: Iterable<number>) {
    const message = parseMessage(data);
    if (message instanceof NoteOn) {
      this.keyGraphs.get(message.note.byteValue)?.stop();
      this.sustained.delete(message.note.byteValue);

      const keyGraph =
        this.inactiveKeyGraphs.pop() ?? new KeyGraph(this.gain, this.waveform);
      this.keyGraphs.set(message.note.byteValue, keyGraph);
      keyGraph.start(
        message.note.frequency,
        (GAIN_MULTIPLIER * message.velocity) / 0x7f,
        this.waveform
      );
      keyGraph.addEventListener(
        'inactive',
        () => this.inactiveKeyGraphs.push(keyGraph),
        true
      );
      return;
    }
    if (message instanceof NoteOff) {
      if (this.sustain) {
        this.sustained.add(message.note.byteValue);
      } else {
        this.keyGraphs.get(message.note.byteValue)?.stop();
        this.keyGraphs.delete(message.note.byteValue);
      }
      return;
    }
    if (message instanceof ChannelControlMessage) {
      switch (message.type) {
        case ChannelControlType.SUSTAIN: {
          const applySustain = message.data >= 0x40;
          if (!applySustain) {
            for (const note of this.sustained) {
              this.keyGraphs.get(note)?.stop();
              this.keyGraphs.delete(note);
            }
            this.sustained.clear();
          }
          this.sustain = applySustain;
          break;
        }
        case ChannelControlType.ALL_NOTES_OFF:
        case ChannelControlType.ALL_SOUND_OFF:
          for (const keyGraph of this.keyGraphs.values()) {
            keyGraph.stop(message.type === ChannelControlType.ALL_SOUND_OFF);
          }
          this.keyGraphs.clear();
          break;
        case ChannelControlType.RESET_ALL_CONTROLLERS:
          this.sustain = false;
          this.sustained.clear();
          for (const keygraph of this.keyGraphs.values()) {
            keygraph.stop(true);
          }
          this.keyGraphs.clear();
          break;
        // TODO: Implement volume / expression, see
        // http://midi.teragonaudio.com/tech/midispec/exp.htm
        // TODO: Implement program change.
        default:
          console.log(`Unmapped channel control message: ${message}`);
          break;
      }
      return;
    }
    console.log(`Unmapped message: ${message}`);
  }

  getCurrentlyPressed(): number[] {
    const active = Array.from(this.keyGraphs.keys());
    if (this.sustain) {
      return active.filter((n) => !this.sustained.has(n));
    }
    return active;
  }

  getSustain() {
    return this.sustain;
  }
}
