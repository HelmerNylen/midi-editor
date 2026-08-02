'use strict';

import {TypedEventTarget} from './event.js';
import {keyFromNumSharps, keyLabel, Note} from './note.js';
import {TempoMap} from './tempo.js';

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

export enum MetaEvent {
  SEQUENCE_NUMBER = 0x00,
  TEXT = 0x01,
  COPYRIGHT = 0x02,
  TRACK_NAME = 0x03,
  INSTRUMENT_NAME = 0x04,
  LYRIC = 0x05,
  MARKER = 0x06,
  CUE_POINT = 0x07,
  PROGRAM_NAME = 0x08,
  DEVICE_NAME = 0x09,
  MIDI_CHANNEL_PREFIX = 0x20,
  MIDI_PORT = 0x21,
  END_OF_TRACK = 0x2f,
  TEMPO = 0x51,
  SMPTE_OFFSET = 0x54,
  TIME_SIGNATURE = 0x58,
  KEY_SIGNATURE = 0x59,
  SEQUENCER_SPECIFIC = 0x7f,
}

export enum SystemMessage {
  SYSTEM_EXCLUSIVE = 0xf0,
  SONG_POSITION_POINTER = 0xf2,
  SONG_SELECT = 0xf3,
  TUNE_REQUEST = 0xf6,
  END_OF_EXCLUSIVE = 0xf7,
  TIMING_CLOCK = 0xf8,
  START = 0xfa,
  CONTINUE = 0xfb,
  STOP = 0xfc,
  ACTIVE_SENSING = 0xfe,
  RESET = 0xff,
}

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

/**
 * Reads a variable length quantity, returning a [result, offset] tuple with the
 * offset pointing to the first byte after the quantity.
 */
function readUintN(view: DataView, offset: number): [number, number] {
  let result = 0;
  for (let i = 0; i < 4; i++) {
    const byte = view.getUint8(offset++);
    result <<= 7;
    result |= byte & DATA_MASK;
    if (!(byte & 0x80)) {
      return [result, offset];
    }
  }
  throw new Error(
    `Variable length quantity longer than four bytes at offset ${offset}`
  );
}

export enum TimeCode {
  FPS_24 = 0xe8,
  FPS_25 = 0xe7,
  FPS_30 = 0xe2,
  FPS_30_DROP = 0xe3,
}
const FPS_BY_TIME_CODE = new Map([
  [TimeCode.FPS_24, 24],
  [TimeCode.FPS_25, 25],
  [TimeCode.FPS_30, 30],
  [TimeCode.FPS_30_DROP, 29.97],
]);

export class FileParser extends TypedEventTarget<{
  note: {on: NoteOn; off: NoteOff; start: number; stop: number};
}> {
  private view: DataView;
  private asciiDecoder = new TextDecoder('ascii', {
    fatal: true,
    ignoreBOM: true,
  });
  private ticksPerQuarter?: number;
  private secondsPerTick?: number;

  private tempoEventEmitter = new TypedEventTarget<{tempo: number}>();
  private tempoMap?: TempoMap;

  constructor(private buffer: ArrayBuffer) {
    super();
    this.view = new DataView(buffer);
  }

  parse() {
    let offset = 0;
    while (offset + 8 < this.buffer.byteLength) {
      const type = this.asciiDecoder.decode(
        this.buffer.slice(offset, offset + 4)
      );
      const length = this.view.getUint32(offset + 4);
      if (offset + 8 + length > this.buffer.byteLength) {
        throw new Error(
          `Chunk of type ${type} at offset ${offset} ends at ` +
            `${offset + 8 + length}, but the file is only ` +
            `${this.buffer.byteLength} long`
        );
      }
      const content = new DataView(this.buffer, offset + 8, length);

      switch (type) {
        case 'MThd':
          this.readHeader(content);
          break;
        case 'MTrk':
          this.readTrack(content);
          break;
        default:
          console.log(`Unknown chunk type ${type} with length ${length}`);
          break;
      }

      offset += 8 + length;
    }
  }

  private readHeader(chunk: DataView) {
    console.log(`Reading header with size ${chunk.byteLength} bytes`);
    if (chunk.byteLength < 6) {
      throw new Error(
        `MIDI header must have at least 6 bytes, got: ${chunk.byteLength}`
      );
    }

    const format = chunk.getUint16(0);
    const numTracks = chunk.getUint16(2);
    const division = chunk.getUint16(4);

    if (format === 0 && numTracks !== 1) {
      throw new Error(
        `Format 0 files must have exactly one track, got: ${numTracks}`
      );
    }

    if (division & 0x8000) {
      // MIDI time code
      const timeCode: TimeCode = chunk.getUint8(4);
      if (!FPS_BY_TIME_CODE.has(timeCode)) {
        throw new Error(`Invalid time code: ${timeCode}`);
      }
      const ticksPerFrame = chunk.getUint8(5);
      console.log(
        `Time code ${timeCode.toString(16)}, ${ticksPerFrame} ticks/frame`
      );
      this.secondsPerTick =
        1 / (ticksPerFrame * FPS_BY_TIME_CODE.get(timeCode)!);
    } else {
      // Ticks per quarter
      console.log(`${division} ticks/quarter`);
      this.ticksPerQuarter = division;
    }

    console.log(`Format ${format}, ${numTracks} tracks`);
  }

  private readTrack(chunk: DataView) {
    console.log(`Reading track with size ${chunk.byteLength} bytes`);

    let offset = 0;
    let ticks = 0;
    let notesToLog = 3;
    const pressed = new Map<number, {on: NoteOn; start: number}>();
    const messageParser = new MessageParser();
    messageParser.addEventListener('noteOn', (on: NoteOn) => {
      const press = {
        on,
        start: this.tempoMap
          ? this.tempoMap.ticksToSeconds(ticks)
          : ticks * this.secondsPerTick!,
      };
      if (notesToLog-- > 0) {
        console.log(
          `Note ${on.note} pressed at ${ticks} ticks (${press.start} s)`
        );
      }
      pressed.set(on.note.byteValue, press);
    });
    messageParser.addEventListener('noteOff', (off) => {
      const press = pressed.get(off.note.byteValue);
      if (!press) {
        return;
      }
      this.dispatchEvent('note', {
        ...press,
        off,
        stop: this.tempoMap
          ? this.tempoMap.ticksToSeconds(ticks)
          : ticks * this.secondsPerTick!,
      });
    });

    const tempoMapBuilder = TempoMap.builder(this.ticksPerQuarter!);
    const addTempo = (tempo: number) => tempoMapBuilder.addChange(ticks, tempo);
    this.tempoEventEmitter.addEventListener('tempo', addTempo);

    let lastStatus = null;
    while (offset < chunk.byteLength) {
      let delta;
      [delta, offset] = readUintN(chunk, offset);
      ticks += delta;

      let status = chunk.getUint8(offset++);
      if (!(status & 0x80)) {
        // Running status
        if (lastStatus === null) {
          throw new Error(`Missing status byte in first event`);
        }
        status = lastStatus;
      } else {
        lastStatus = status;
      }

      switch (status & MESSAGE_TYPE_MASK) {
        case MessageType.SYSTEM_COMMON: {
          offset = this.handleSysex(chunk, offset, status);
          break;
        }
        case MessageType.PROGRAM_CHANGE:
        case MessageType.CHANNEL_PRESSURE: {
          // Parse MIDI event of length 2.
          messageParser.send(Uint8Array.of(status, chunk.getUint8(offset++)));
          break;
        }
        default: {
          // Parse MIDI event of length 3.
          messageParser.send(
            Uint8Array.of(
              status,
              chunk.getUint8(offset++),
              chunk.getUint8(offset++)
            )
          );
          break;
        }
      }
    }

    this.tempoEventEmitter.removeEventListener('tempo', addTempo);
    if (tempoMapBuilder.length && !this.tempoMap) {
      // TODO: Format 2 files may have different tempos for different tracks.
      this.tempoMap = tempoMapBuilder.build();
    }
  }

  private handleSysex(chunk: DataView, offset: number, status: number): number {
    switch (status) {
      case SystemMessage.SYSTEM_EXCLUSIVE: {
        while (chunk.getUint8(offset++) !== SystemMessage.END_OF_EXCLUSIVE) {
          // Skip over message.
        }
        break;
      }
      case SystemMessage.END_OF_EXCLUSIVE: {
        let length;
        [length, offset] = readUintN(chunk, offset);
        // Skip over message.
        offset += length;
        break;
      }
      case SystemMessage.RESET: {
        // Meta event: FF <event type> <len> <len bytes of data>
        const metaEventType = chunk.getUint8(offset);
        const dataLength = chunk.getUint8(offset + 1);
        const data = new Uint8Array(
          chunk.buffer,
          chunk.byteOffset + offset + 2,
          dataLength
        );
        this.handleMeta(metaEventType, data);
        offset += dataLength + 2;
        break;
      }
      case SystemMessage.SONG_POSITION_POINTER: {
        const songPosition =
          (chunk.getUint8(offset + 1) << 7) | chunk.getUint8(offset);
        console.log(`Song position pointer event with data ${songPosition}`);
        offset += 2;
        break;
      }
      case SystemMessage.SONG_SELECT: {
        const songIndex = chunk.getUint8(offset);
        console.log(`Song select event with data ${songIndex}`);
        offset += 1;
        break;
      }
      default: {
        console.log(`${SystemMessage[status]} event`);
      }
    }

    return offset;
  }

  private handleMeta(type: MetaEvent, data: Uint8Array) {
    switch (type) {
      case MetaEvent.TEXT:
      case MetaEvent.COPYRIGHT:
      case MetaEvent.TRACK_NAME:
      case MetaEvent.INSTRUMENT_NAME:
      case MetaEvent.LYRIC:
      case MetaEvent.MARKER:
      case MetaEvent.CUE_POINT: {
        console.log(`${MetaEvent[type]}: ${this.asciiDecoder.decode(data)}`);
        break;
      }
      case MetaEvent.KEY_SIGNATURE: {
        const key = keyFromNumSharps(data[0]);
        console.log(`Key: ${keyLabel(key)} ${data[1] ? 'minor' : 'major'}`);
        break;
      }
      case MetaEvent.TIME_SIGNATURE: {
        const numerator = data[0];
        const denominator = 1 << data[1];
        const clocksPerClick = data[2];
        const unitLengthInNotesBy32 = data[3];
        console.log(
          `Time signature ${numerator}/${denominator}, metronome click every ` +
            `${clocksPerClick} clocks (${24 / clocksPerClick} clicks/quarter)` +
            `, ${32 / unitLengthInNotesBy32} quarters per note`
        );
        break;
      }
      case MetaEvent.TEMPO: {
        const tempo = (data[0] << 16) | (data[1] << 8) | data[2];
        this.tempoEventEmitter.dispatchEvent('tempo', tempo);
        break;
      }
      default: {
        console.log(`${MetaEvent[type]} meta event with data`, data);
        break;
      }
    }
  }
}
