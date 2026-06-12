'use strict';

import {TypedEventTarget} from './event.js';
import {ChannelControlMessage, ChannelControlType, Message} from './message.js';
import {Selector} from './selector.js';
import {SimpleMIDIOutput, Synthesizer} from './synthesizer.js';
import {optionalElementDeps} from './utils.js';

type SimpleMIDIInput = Pick<
  MIDIInput,
  'addEventListener' | 'name' | 'removeEventListener' | 'id'
>;

const NO_MIDI_INPUT = {
  name: 'No input device',
  id: 'no_midi_input',
  addEventListener() {},
  removeEventListener() {},
} as const satisfies SimpleMIDIInput;

export class Player extends TypedEventTarget<{onmessage: Uint8Array}> {
  private readonly elements = optionalElementDeps({
    input: HTMLSelectElement,
    output: HTMLSelectElement,
    waveform: HTMLSelectElement,
    setupMidi: HTMLButtonElement,
  });

  readonly synthesizer = new Synthesizer(
    new AudioContext(),
    this.elements.waveform
  );
  private midi: MIDIAccess | null = null;

  private readonly availableInputs: SimpleMIDIInput[] = [NO_MIDI_INPUT];
  private readonly availableOutputs: SimpleMIDIOutput[] = [this.synthesizer];
  private readonly inputSelector: Selector<SimpleMIDIInput> | null = null;
  private readonly outputSelector: Selector<SimpleMIDIOutput> | null = null;
  private input: SimpleMIDIInput = NO_MIDI_INPUT;
  private output: SimpleMIDIOutput = this.synthesizer;
  private readonly inputEventListener = ({data}: MIDIMessageEvent) => {
    if (data) {
      this.output.send(data);
      this.dispatchEvent('onmessage', data);
    }
  };

  constructor() {
    super();
    if (this.elements.input) {
      this.inputSelector = new Selector(
        this.elements.input,
        this.availableInputs,
        NO_MIDI_INPUT,
        (input) => input.name ?? input.id,
        (input) => input.id
      );
      this.inputSelector.addEventListener('select', (input) =>
        this.changeInput(input ?? NO_MIDI_INPUT)
      );
    }
    if (this.elements.output) {
      this.outputSelector = new Selector(
        this.elements.output,
        this.availableOutputs,
        this.synthesizer,
        (output) => output.name ?? output.id,
        (output) => output.id
      );
      this.outputSelector.addEventListener('select', (output) =>
        this.changeOutput(output ?? this.synthesizer)
      );
    }

    this.elements.setupMidi?.addEventListener('click', () => this.setupMidi());
    this.setupMidi(false);
  }

  async setupMidi(prompt = true) {
    if (!this.midi) {
      if (!prompt) {
        const {state} = await navigator.permissions.query({name: 'midi'});
        if (state !== 'granted') {
          return;
        }
      }
      this.midi = await navigator.requestMIDIAccess({software: true});
      this.midi.addEventListener('statechange', () => this.syncDevices());
    }
    this.syncDevices();
  }

  private syncDevices() {
    this.availableInputs.length = 0;
    this.availableInputs.push(NO_MIDI_INPUT);
    this.midi?.inputs.forEach((input) => this.availableInputs.push(input));
    this.availableOutputs.length = 0;
    this.availableOutputs.push(this.synthesizer);
    this.midi?.outputs.forEach((output) => this.availableOutputs.push(output));

    this.inputSelector?.syncOptions();
    this.outputSelector?.syncOptions();
  }

  private changeInput(input: SimpleMIDIInput) {
    if (input === this.input) {
      return;
    }
    this.input.removeEventListener('midimessage', this.inputEventListener);
    this.input = input;
    this.input.addEventListener('midimessage', this.inputEventListener);
  }

  private changeOutput(output: SimpleMIDIOutput) {
    if (output === this.output) {
      return;
    }
    this.send(new ChannelControlMessage(ChannelControlType.ALL_NOTES_OFF));
    this.output = output;
  }

  send(data: Message) {
    this.output.send(data.serialize());
  }
}
