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

export enum Instrument {
  ACOUSTIC_GRAND_PIANO = 0,
  BRIGHT_ACOUSTIC_PIANO = 1,
  ELECTRIC_GRAND_PIANO = 2,
  HONKY_TONK_PIANO = 3,
  ELECTRIC_PIANO_1 = 4,
  ELECTRIC_PIANO_2 = 5,
  HARPSICHORD = 6,
  CLAVI = 7,
  CELESTA = 8,
  GLOCKENSPIEL = 9,
  MUSIC_BOX = 10,
  VIBRAPHONE = 11,
  MARIMBA = 12,
  XYLOPHONE = 13,
  TUBULAR_BELLS = 14,
  DULCIMER = 15,
  DRAWBAR_ORGAN = 16,
  PERCUSSIVE_ORGAN = 17,
  ROCK_ORGAN = 18,
  CHURCH_ORGAN = 19,
  REED_ORGAN = 20,
  ACCORDION = 21,
  HARMONICA = 22,
  TANGO_ACCORDION = 23,
  ACOUSTIC_GUITAR_NYLON = 24,
  ACOUSTIC_GUITAR_STEEL = 25,
  ELECTRIC_GUITAR_JAZZ = 26,
  ELECTRIC_GUITAR_CLEAN = 27,
  ELECTRIC_GUITAR_MUTED = 28,
  OVERDRIVEN_GUITAR = 29,
  DISTORTION_GUITAR = 30,
  GUITAR_HARMONICS = 31,
  ACOUSTIC_BASS = 32,
  ELECTRIC_BASS_FINGER = 33,
  ELECTRIC_BASS_PICK = 34,
  FRETLESS_BASS = 35,
  SLAP_BASS_1 = 36,
  SLAP_BASS_2 = 37,
  SYNTH_BASS_1 = 38,
  SYNTH_BASS_2 = 39,
  VIOLIN = 40,
  VIOLA = 41,
  CELLO = 42,
  CONTRABASS = 43,
  TREMOLO_STRINGS = 44,
  PIZZICATO_STRINGS = 45,
  ORCHESTRAL_HARP = 46,
  TIMPANI = 47,
  STRING_ENSEMBLE_1 = 48,
  STRING_ENSEMBLE_2 = 49,
  SYNTH_STRINGS_1 = 50,
  SYNTH_STRINGS_2 = 51,
  CHOIR_AAHS = 52,
  VOICE_OOHS = 53,
  SYNTH_VOICE = 54,
  ORCHESTRA_HIT = 55,
  TRUMPET = 56,
  TROMBONE = 57,
  TUBA = 58,
  MUTED_TRUMPET = 59,
  FRENCH_HORN = 60,
  BRASS_SECTION = 61,
  SYNTH_BRASS_1 = 62,
  SYNTH_BRASS_2 = 63,
  SOPRANO_SAX = 64,
  ALTO_SAX = 65,
  TENOR_SAX = 66,
  BARITONE_SAX = 67,
  OBOE = 68,
  ENGLISH_HORN = 69,
  BASSOON = 70,
  CLARINET = 71,
  PICCOLO = 72,
  FLUTE = 73,
  RECORDER = 74,
  PAN_FLUTE = 75,
  BLOWN_BOTTLE = 76,
  SHAKUHACHI = 77,
  WHISTLE = 78,
  OCARINA = 79,
  LEAD_1_SQUARE = 80,
  LEAD_2_SAWTOOTH = 81,
  LEAD_3_CALLIOPE = 82,
  LEAD_4_CHIFF = 83,
  LEAD_5_CHARANG = 84,
  LEAD_6_VOICE = 85,
  LEAD_7_FIFTHS = 86,
  LEAD_8_BASS_LEAD = 87,
  PAD_1_NEW_AGE = 88,
  PAD_2_WARM = 89,
  PAD_3_POLYSYNTH = 90,
  PAD_4_CHOIR = 91,
  PAD_5_BOWED = 92,
  PAD_6_METALLIC = 93,
  PAD_7_HALO = 94,
  PAD_8_SWEEP = 95,
  FX_1_RAIN = 96,
  FX_2_SOUNDTRACK = 97,
  FX_3_CRYSTAL = 98,
  FX_4_ATMOSPHERE = 99,
  FX_5_BRIGHTNESS = 100,
  FX_6_GOBLINS = 101,
  FX_7_ECHOES = 102,
  FX_8_SCI_FI = 103,
  SITAR = 104,
  BANJO = 105,
  SHAMISEN = 106,
  KOTO = 107,
  KALIMBA = 108,
  BAG_PIPE = 109,
  FIDDLE = 110,
  SHANAI = 111,
  TINKLE_BELL = 112,
  AGOGO = 113,
  STEEL_DRUMS = 114,
  WOODBLOCK = 115,
  TAIKO_DRUM = 116,
  MELODIC_TOM = 117,
  SYNTH_DRUM = 118,
  REVERSE_CYMBAL = 119,
  GUITAR_FRET_NOISE = 120,
  BREATH_NOISE = 121,
  SEASHORE = 122,
  BIRD_TWEET = 123,
  TELEPHONE_RING = 124,
  HELICOPTER = 125,
  APPLAUSE = 126,
  GUNSHOT = 127,
}

export enum InstrumentFamily {
  PIANO = 0,
  CHROMATIC_PERCUSSION = 1,
  ORGAN = 2,
  GUITAR = 3,
  BASS = 4,
  STRINGS = 5,
  ENSEMBLE = 6,
  BRASS = 7,
  REED = 8,
  PIPE = 9,
  SYNTH_LEAD = 10,
  SYNTH_PAD = 11,
  SYNTH_EFFECTS = 12,
  ETHNIC = 13,
  PERCUSSIVE = 14,
  SOUND_EFFECTS = 15,
}

export function getInstrumentFamily(instrument: Instrument): InstrumentFamily {
  return instrument >> 3;
}

const MESSAGE_TYPE_MASK = 0xf0;
const CHANNEL_MASK = 0x0f;
const DATA_MASK = 0x7f;
const LSB_MASK_14_BIT = DATA_MASK;
const MSB_MASK_14_BIT = DATA_MASK << 7;
const CHANNEL_CONTROL_14_BIT_BLOCK = 0x3f;
export const DEFAULT_NOTE_OFF_VELOCITY = 0x40;

export interface Message {
  serialize(): Uint8Array;
}

export function checkValidData(
  value: number,
  descriptor = 'data byte',
  mask = DATA_MASK
) {
  if (value !== (value & mask)) {
    throw new Error(`Invalid ${descriptor}: ${value}`);
  }
}

export function checkValidChannel(channel: number) {
  checkValidData(channel, 'channel', CHANNEL_MASK);
}

export class NoteOn implements Message {
  constructor(
    readonly note: Note,
    readonly velocity: number,
    readonly channel: number = 0
  ) {
    checkValidData(velocity, 'velocity');
    checkValidChannel(channel);
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
    readonly velocity: number = DEFAULT_NOTE_OFF_VELOCITY,
    readonly channel: number = 0
  ) {
    checkValidData(velocity, 'velocity');
    checkValidChannel(channel);
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
    checkValidData(type, 'channel control message type');
    checkValidChannel(channel);
    if (typeof data === 'boolean') {
      this.data = data ? 0x7f : 0;
    } else {
      checkValidData(data);
      this.data = data;
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
    let message;
    switch (status & MESSAGE_TYPE_MASK) {
      case MessageType.NOTE_ON: {
        const note = new Note(consume());
        const velocity = consume();
        if (velocity > 0) {
          message = new NoteOn(note, velocity, status & CHANNEL_MASK);
          this.dispatchEvent('noteOn', message as NoteOn);
        } else {
          message = new NoteOff(
            note,
            DEFAULT_NOTE_OFF_VELOCITY,
            status & CHANNEL_MASK
          );
          this.dispatchEvent('noteOff', message as NoteOff);
        }
        break;
      }
      case MessageType.NOTE_OFF: {
        message = new NoteOff(
          new Note(consume()),
          consume(),
          status & CHANNEL_MASK
        );
        this.dispatchEvent('noteOff', message as NoteOff);
        break;
      }
      case MessageType.CONTROL_CHANGE: {
        message = new ChannelControlMessage(
          consume(),
          consume(),
          status & CHANNEL_MASK
        );
        this.dispatchEvent('channelControl', message as ChannelControlMessage);
        break;
      }
      default: {
        message = new GenericMessage(
          data instanceof Uint8Array
            ? data
            : Uint8Array.of(status, ...{[Symbol.iterator]: () => iterator})
        );
        this.dispatchEvent('unmapped', message as GenericMessage);
        break;
      }
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

/**
 * Writes a variable length quantity, returning an offset pointing to the first
 * byte after the quantity.
 */
export function writeUintN(
  view: DataView,
  offset: number,
  value: number
): number {
  if (value !== (value & 0xfffffff)) {
    throw new Error(
      `Variable length quantity out of range [0, ${0xfffffff}]: ${value}`
    );
  }
  if (value > DATA_MASK << 14) {
    view.setUint8(offset++, (value >> 21) | 0x80);
  }
  if (value > DATA_MASK << 7) {
    view.setUint8(offset++, ((value >> 14) & DATA_MASK) | 0x80);
  }
  if (value > DATA_MASK) {
    view.setUint8(offset++, ((value >> 7) & DATA_MASK) | 0x80);
  }
  view.setUint8(offset++, value & DATA_MASK);
  return offset;
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
    let notesToLog = 6;
    const pressed = new Map<number, {on: NoteOn; start: number}>();
    const messageParser = new MessageParser();
    messageParser.addEventListener('noteOn', (on: NoteOn) => {
      const press = {
        on,
        // TODO: Tempo map not defined until the entire track has been processed
        // for format 0.
        start: this.tempoMap
          ? this.tempoMap.ticksToSeconds(ticks)
          : ticks * this.secondsPerTick!,
      };
      if (notesToLog-- > 0) {
        console.log(
          `Note ${on.note} pressed (v=${on.velocity}) at ${ticks} ticks ` +
            `(${press.start} s)`
        );
      }
      pressed.set(on.note.byteValue, press);
    });
    messageParser.addEventListener('noteOff', (off) => {
      const press = pressed.get(off.note.byteValue);
      if (!press) {
        return;
      }
      if (notesToLog-- > 0) {
        console.log(
          `Note ${off.note} released (v=${off.velocity}) at ${ticks} ticks ` +
            `(${press.start} s)`
        );
      }
      this.dispatchEvent('note', {
        ...press,
        off,
        stop: this.tempoMap
          ? this.tempoMap.ticksToSeconds(ticks)
          : ticks * this.secondsPerTick!,
      });
    });
    messageParser.addEventListener('message', (e) => {
      if (
        e instanceof GenericMessage &&
        e.messageType === MessageType.PROGRAM_CHANGE
      ) {
        console.log(
          `Channel ${e.channel} instrument: ` +
            `${Instrument[e.data[0]] ?? e.data.toHex()}`
        );
      }
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
        // TODO: Only kept for MIDI events (i.e. not sysex/meta)?
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
        console.log(
          `Key: ${keyLabel(key, key)} ${data[1] ? 'minor' : 'major'}`
        );
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
