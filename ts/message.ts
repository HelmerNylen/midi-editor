'use strict';

import {TypedEventTarget} from './event.js';
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
  SOSTENUTO = 0x42,
  SOFT = 0x43,
  LEGATO = 0x44,
  HOLD_2 = 0x45,
  NON_REGISTERED_PARAMETER_NUMBER_LSB = 0x62,
  NON_REGISTERED_PARAMETER_NUMBER_MSB = 0x63,
  REGISTERED_PARAMETER_NUMBER_LSB = 0x64,
  REGISTERED_PARAMETER_NUMBER_MSB = 0x65,
  ALL_SOUND_OFF = 0x78,
  RESET_ALL_CONTROLLERS = 0x79,
  LOCAL_CONTROL = 0x7a,
  ALL_NOTES_OFF = 0x7b,
}

export type ChannelControlSwitch =
  | ChannelControlType.SUSTAIN
  | ChannelControlType.PORTAMENTO
  | ChannelControlType.SOSTENUTO
  | ChannelControlType.SOFT
  | ChannelControlType.LEGATO
  | ChannelControlType.HOLD_2
  | ChannelControlType.LOCAL_CONTROL;

const MESSAGE_TYPE_MASK = 0xf0;
const CHANNEL_MASK = 0x0f;
const DATA_MASK = 0x7f;
const LSB_MASK_14_BIT = DATA_MASK;
const MSB_MASK_14_BIT = DATA_MASK << 7;
const CHANNEL_CONTROL_14_BIT_BLOCK = 0x3f;

export interface Message {
  serialize(): Uint8Array;
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
    return Uint8Array.of(
      MessageType.NOTE_ON | this.channel,
      this.note.byteValue,
      this.velocity
    );
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
    return Uint8Array.of(
      MessageType.NOTE_OFF | this.channel,
      this.note.byteValue,
      this.velocity
    );
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
    return Uint8Array.of(
      MessageType.CONTROL_CHANGE | this.channel,
      this.type,
      this.data
    );
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
  constructor(private readonly serialized: Uint8Array) {
    if (serialized.length === 0) {
      throw new Error(`Empty message: ${serialized}`);
    }
    const status = this.status;
    if (status !== (status & 0xff) || !(status & 0x80)) {
      throw new Error(`Invalid status byte: ${status}`);
    }
  }

  get status(): number {
    return this.serialized[0];
  }

  get messageType(): MessageType {
    return this.status & MESSAGE_TYPE_MASK;
  }

  get channel(): MessageType {
    return this.status & CHANNEL_MASK;
  }

  get data(): Uint8Array {
    return this.serialized.subarray(1);
  }

  serialize() {
    return this.serialized;
  }

  toString() {
    return (
      `GenericMessage(${MessageType[this.messageType]}, channel: ` +
      `${this.channel}, data: 0x${this.data.toHex()})`
    );
  }
}

interface MessageParserEvents {
  message: Message;
  noteOn: NoteOn;
  noteOff: NoteOff;
  channelControl: ChannelControlMessage;
  unmapped: GenericMessage;
}

export class MessageParser extends TypedEventTarget<MessageParserEvents> {
  send(data: Iterable<number>): void {
    const iterator = data[Symbol.iterator]();
    const consume: () => number = () => {
      const result = iterator.next();
      if (result.done) {
        throw new Error(`Incomplete message received: ${data}`);
      }
      return result.value;
    };

    const status = consume();
    let message: Message;
    switch (status & MESSAGE_TYPE_MASK) {
      case MessageType.NOTE_ON:
        message = new NoteOn(
          new Note(consume()),
          consume(),
          status & CHANNEL_MASK
        );
        this.dispatchEvent('noteOn', message as NoteOn);
        break;
      case MessageType.NOTE_OFF:
        message = new NoteOff(
          new Note(consume()),
          consume(),
          status & CHANNEL_MASK
        );
        this.dispatchEvent('noteOff', message as NoteOff);
        break;
      case MessageType.CONTROL_CHANGE:
        message = new ChannelControlMessage(
          consume(),
          consume(),
          status & CHANNEL_MASK
        );
        this.dispatchEvent('channelControl', message as ChannelControlMessage);
        break;
      default:
        message = new GenericMessage(
          data instanceof Uint8Array
            ? data
            : Uint8Array.of(status, ...{[Symbol.iterator]: () => iterator})
        );
        this.dispatchEvent('unmapped', message as GenericMessage);
        break;
    }
    this.dispatchEvent('message', message);
  }
}
