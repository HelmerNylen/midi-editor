import {Note} from './note.js';

// See https://midi.org/summary-of-midi-1-0-messages or
// https://midimusic.github.io/tech/midispec.html or
// https://www.songstuff.com/recording/article/midi-message-format/.

export enum MessageType {
  NOTE_OFF = 0x80,
  NOTE_ON = 0x90,
  POLYPHONIC_KEY_PRESSURE = 0xa0,
  CONTROL_CHANGE = 0xb0,
  PROGRAM_CHANGE = 0xc0,
  CHANNEL_PRESSURE = 0xd0,
  PITCH_BEND_CHANGE = 0xe0,
  SYSTEM_COMMON = 0xf0,
}

export enum ChannelControlType {
  MODULATION_MSB = 0x01,
  BREATH_MSB = 0x02,
  FOOT_MSB = 0x04,
  PORTAMENTO_TIME_MSB = 0x05,
  DATA_ENTRY_MSB = 0x06,
  VOLUME_MSB = 0x07,
  PAN_MSB = 0x0a,
  EXPRESSION_LSB = 0x0b,
  MODULATION_LSB = 0x21,
  BREATH_LSB = 0x22,
  FOOT_LSB = 0x24,
  PORTAMENTO_TIME_LSB = 0x25,
  DATA_ENTRY_LSB = 0x26,
  VOLUME_LSB = 0x27,
  PAN_LSB = 0x2a,
  EXPRESSION_MSB = 0x2b,
  SUSTAIN = 0x40,
  PORTAMENTO = 0x41,
  SOSTENATO = 0x42,
  SOFT = 0x43,
  NON_REGISTERED_PARAMETER_NUMBER_LSB = 0x62,
  NON_REGISTERED_PARAMETER_NUMBER_MSB = 0x63,
  REGISTERED_PARAMETER_NUMBER_LSB = 0x64,
  REGISTERED_PARAMETER_NUMBER_MSB = 0x65,
  ALL_SOUND_OFF = 0x78,
  RESET_ALL_CONTROLLERS = 0x79,
  ALL_NOTES_OFF = 0x7b,
}

const MESSAGE_TYPE_MASK = 0xf0;
const CHANNEL_MASK = 0x0f;
const DATA_MASK = 0x7f;
const LSB_MASK_14_BIT = DATA_MASK;
const MSB_MASK_14_BIT = DATA_MASK << 7;
const CHANNEL_CONTROL_14_BIT_BLOCK = 0x3f;

export interface Message {
  serialize(): Iterable<number>;
}

export class NoteOn implements Message {
  constructor(
    readonly note: Note,
    readonly velocity: number,
    readonly channel: number = 0
  ) {
    if (velocity !== (velocity & DATA_MASK)) {
      throw new Error(`Invalid velocity: ${velocity}`);
    }
    if (channel !== (channel & CHANNEL_MASK)) {
      throw new Error(`Invalid channel: ${channel}`);
    }
  }

  serialize() {
    return [
      MessageType.NOTE_ON | this.channel,
      this.note.byteValue,
      this.velocity,
    ];
  }
}

export class NoteOff implements Message {
  constructor(
    readonly note: Note,
    readonly velocity: number = 0,
    readonly channel: number = 0
  ) {
    if (velocity !== (velocity & DATA_MASK)) {
      throw new Error(`Invalid velocity: ${velocity}`);
    }
    if (channel !== (channel & CHANNEL_MASK)) {
      throw new Error(`Invalid channel: ${channel}`);
    }
  }

  serialize() {
    return [
      MessageType.NOTE_OFF | this.channel,
      this.note.byteValue,
      this.velocity,
    ];
  }
}

export class ChannelControlMessage implements Message {
  readonly data: number;

  constructor(
    readonly type: ChannelControlType,
    data: number | boolean = 0,
    readonly channel: number = 0
  ) {
    if (type !== (type & DATA_MASK)) {
      throw new Error(`Invalid channel control message type: ${type}`);
    }
    if (typeof data === 'boolean') {
      this.data = data ? 0x7f : 0;
    } else if (data !== (data & DATA_MASK)) {
      throw new Error(`Invalid data: ${data}`);
    } else {
      this.data = data;
    }
    if (channel !== (channel & CHANNEL_MASK)) {
      throw new Error(`Invalid channel: ${channel}`);
    }
  }

  serialize() {
    return [MessageType.CONTROL_CHANGE | this.channel, this.type, this.data];
  }

  toString() {
    const type = ChannelControlType[this.type] ?? '0x' + this.type.toString(16);
    return (
      `ChannelControlMessage(${type}, channel: ${this.channel}, ` +
      `data: 0x${this.data.toString(16)})`
    );
  }
}

export function apply14BitUpdate(
  message: ChannelControlMessage,
  value: number = 0
) {
  let isMsb: boolean;
  if (message.type === (message.type & CHANNEL_CONTROL_14_BIT_BLOCK)) {
    isMsb = message.type > CHANNEL_CONTROL_14_BIT_BLOCK >> 1;
  } else {
    switch (message.type) {
      case ChannelControlType.NON_REGISTERED_PARAMETER_NUMBER_LSB:
        isMsb = false;
        break;
      case ChannelControlType.NON_REGISTERED_PARAMETER_NUMBER_MSB:
        isMsb = true;
        break;
      case ChannelControlType.REGISTERED_PARAMETER_NUMBER_LSB:
        isMsb = false;
        break;
      case ChannelControlType.REGISTERED_PARAMETER_NUMBER_MSB:
        isMsb = true;
        break;
      default:
        throw new Error(`Not a 14-bit controller: ${message.type}`);
    }
  }

  value &= isMsb ? LSB_MASK_14_BIT : MSB_MASK_14_BIT;
  value |= isMsb ? message.data << 7 : message.data;
  return value;
}

export class GenericMessage implements Message {
  constructor(
    readonly status: number,
    readonly data: Uint8Array
  ) {
    if (status !== (status & 0xff) || !(status & 0x80)) {
      throw new Error(`Invalid status byte: ${status}`);
    }
  }

  get messageType(): MessageType {
    return this.status & MESSAGE_TYPE_MASK;
  }

  get channel(): MessageType {
    return this.status & CHANNEL_MASK;
  }

  *serialize(): Iterable<number> {
    yield this.status;
    yield* this.data;
  }

  toString() {
    return (
      `GenericMessage(${MessageType[this.messageType]}, channel: ` +
      `${this.channel}, data: 0x${this.data.toHex()})`
    );
  }
}

export function parseMessage(data: Iterable<number>): Message {
  const iterator = data[Symbol.iterator]();
  const consume: () => number = () => {
    const result = iterator.next();
    if (result.done) {
      throw new Error(`Incomplete message received: ${data}`);
    }
    return result.value;
  };

  const status = consume();
  switch (status & MESSAGE_TYPE_MASK) {
    case MessageType.NOTE_ON:
      return new NoteOn(new Note(consume()), consume(), status & CHANNEL_MASK);
    case MessageType.NOTE_OFF:
      return new NoteOff(new Note(consume()), consume(), status & CHANNEL_MASK);
    case MessageType.CONTROL_CHANGE: {
      return new ChannelControlMessage(
        consume(),
        consume(),
        status & CHANNEL_MASK
      );
    }
    default:
      return new GenericMessage(
        status,
        data instanceof Uint8Array
          ? data.subarray(1)
          : new Uint8Array({[Symbol.iterator]: () => iterator})
      );
  }
}
