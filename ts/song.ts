'use strict';

import {
  ChannelControlMessage,
  ChannelControlSwitch,
  ChannelControlType,
  checkValidChannel,
  checkValidData,
  DEFAULT_NOTE_OFF_VELOCITY,
  Instrument,
  isChannelControlSwitch,
  Message,
  MetaEvent,
  NoteOff,
  NoteOn,
  SystemMessage,
  writeUintN,
} from './message.js';
import {Note} from './note.js';

export class Song {
  copyright?: string;

  constructor(readonly timingInfo: TimingInfo) {}

  readonly tracks: Track[] = [];

  serialize(format: 0 | 1 = 1): ArrayBuffer {
    // TODO
    return new ArrayBuffer(0);
  }
}

interface TimingInfo {
  supportsTempoChanges: boolean;

  secondsToTicks(seconds: number): number;
  ticksToSeconds(ticks: number): number;
  getDivision(): Uint8Array;
}

const INCONCLUSIVE: unique symbol = Symbol('INCONCLUSIVE');

export class Track {
  channel: number | typeof INCONCLUSIVE = INCONCLUSIVE;
  instrument: Instrument | typeof INCONCLUSIVE = INCONCLUSIVE;
  name?: string;
  sequenceNumber?: number;
  instrumentName?: string;

  readonly events: Event[] = [];
  readonly spans: Span[] = [];

  serialize(): ArrayBuffer {
    // TODO: Add events for name, sequence number etc.
    const events = this.events
      .concat(this.spans.map((span) => span.startEvent()))
      .concat(this.spans.map((span) => span.endEvent()));
    events.sort((a, b) => a.ticks - b.ticks);

    let lastTicks = 0;
    let totalBytes = 0;
    const buffers = new Array<Uint8Array>(events.length * 2 + 1);
    // TODO: Could implement running status. If so, convert NoteOff with default
    // velocity to NoteOn with velocity 0.
    for (let i = 0; i < events.length; i++) {
      const delta = events[i].ticks - lastTicks;
      const buffer = new ArrayBuffer(4);
      const length = writeUintN(new DataView(buffer), 0, delta);
      const serialized = events[i].message.serialize();
      buffers[2 * i] = new Uint8Array(buffer, 0, length);
      buffers[2 * i + 1] = serialized;
      totalBytes += length + serialized.length;
      lastTicks = events[i].ticks;
    }
    buffers[buffers.length - 1] = new Uint8Array([
      0,
      SystemMessage.RESET,
      MetaEvent.END_OF_TRACK,
      0,
    ]);
    totalBytes += 4;

    const totalBuffer = new ArrayBuffer(totalBytes);
    const array = new Uint8Array(totalBuffer, 0, totalBuffer.byteLength);
    let offset = 0;
    for (const buffer of buffers) {
      array.set(buffer, offset);
      offset += buffer.length;
    }
    return totalBuffer;
  }
}

export interface Event<M extends Message = Message> {
  /**
   * The number of ticks from the start of the track at which the event occurs.
   */
  ticks: number;
  /** The message that constitutes the event. */
  message: M;
}

export abstract class Span<
  StartMessage extends Message = Message,
  EndMessage extends Message = StartMessage,
> {
  /**
   * Determines what the span controls (e.g. a certain controller setting or
   * key). Two spans with the same spanKey may not overlap.
   */
  abstract spanKey: number;

  /** The length of the span in number of ticks, excluding the end. */
  get duration(): number {
    return this.end - this.start;
  }

  constructor(
    /**
     * The number of ticks from the start of the track at which the span begins.
     */
    public start: number,
    /**
     * The number of ticks from the start of the track at which the span ends.
     */
    public end: number
  ) {
    if (!(start <= end)) {
      throw new Error(
        `The start of the span must be less than or equal to the end, got ` +
          `start: ${start}, end: ${end}`
      );
    }
  }

  /** Returns an event marking the start of the span. */
  abstract startEvent(): Event<StartMessage>;
  /** Returns an event marking the end of the span. */
  abstract endEvent(): Event<EndMessage>;
}

enum SpanCategory {
  KEY_PRESS = 1,
  CHANNEL_CONTROL_SWITCH = 2,
}

function formSpanKey(
  category: SpanCategory,
  channel: number,
  data: number
): number {
  checkValidChannel(channel);
  checkValidData(data, 'span key data', 0xffff);
  return (category << 20) | (channel << 16) | data;
}

export class KeyPress extends Span<NoteOn, NoteOff> {
  constructor(
    /** The note that is pressed. */
    public note: Note,
    /** The velocity with which the note is pressed. */
    public velocity: number,
    start: number,
    end: number,
    public channel = 0,
    public releaseVelocity: number = DEFAULT_NOTE_OFF_VELOCITY
  ) {
    super(start, end);
    checkValidChannel(channel);
    checkValidData(velocity);
    checkValidData(releaseVelocity);
  }

  override get spanKey() {
    return formSpanKey(
      SpanCategory.KEY_PRESS,
      this.channel,
      this.note.byteValue
    );
  }

  static getSpanKey(message: NoteOn | NoteOff): number {
    return formSpanKey(
      SpanCategory.KEY_PRESS,
      message.channel,
      message.note.byteValue
    );
  }

  static isStart(message: Message): message is NoteOn {
    return message instanceof NoteOn;
  }

  static isEnd(message: Message): message is NoteOff {
    return message instanceof NoteOff;
  }

  static create(start: Event<NoteOn>, end: Event<NoteOff>): KeyPress {
    const {channel, note} = start.message;
    if (channel !== end.message.channel) {
      throw new Error(
        `Start and end channel must match, got: ${channel} != ` +
          `${end.message.channel}`
      );
    }
    if (note.byteValue !== end.message.note.byteValue) {
      throw new Error(
        `Start and end note must match, got: ${note} != ${end.message.note}`
      );
    }

    return new KeyPress(
      note,
      start.message.velocity,
      start.ticks,
      end.ticks,
      channel,
      end.message.velocity
    );
  }

  override startEvent() {
    return {
      message: new NoteOn(this.note, this.velocity, this.channel),
      ticks: this.start,
    };
  }

  override endEvent() {
    return {
      message: new NoteOff(this.note, this.releaseVelocity, this.channel),
      ticks: this.end,
    };
  }
}

export class Switch extends Span<ChannelControlMessage> {
  constructor(
    public pedal: ChannelControlSwitch,
    start: number,
    end: number,
    public channel = 0
  ) {
    super(start, end);
    checkValidChannel(channel);
  }

  override get spanKey() {
    return formSpanKey(
      SpanCategory.CHANNEL_CONTROL_SWITCH,
      this.channel,
      this.pedal
    );
  }

  static getSpanKey(message: ChannelControlMessage): number {
    return formSpanKey(SpanCategory.KEY_PRESS, message.channel, message.type);
  }

  static isStart(message: Message): message is ChannelControlMessage {
    return (
      message instanceof ChannelControlMessage &&
      isChannelControlSwitch(message.type) &&
      message.data >= 0x40
    );
  }

  static isEnd(message: Message): message is ChannelControlMessage {
    return (
      message instanceof ChannelControlMessage &&
      isChannelControlSwitch(message.type) &&
      message.data < 0x40
    );
  }

  static create(
    start: Event<ChannelControlMessage>,
    end: Event<ChannelControlMessage>
  ): Switch {
    const {channel, type} = start.message;
    if (channel !== end.message.channel) {
      throw new Error(
        `Start and end channel must match, got: ${channel} != ` +
          `${end.message.channel}`
      );
    }
    if (type !== end.message.type) {
      throw new Error(
        `Start and end type must match, got: ${ChannelControlType[type]} != ` +
          `${ChannelControlType[end.message.type]}`
      );
    }
    if (!this.isStart(start.message)) {
      throw new Error(`Not a valid start message: ${start.message}`);
    }
    if (!this.isEnd(end.message)) {
      throw new Error(`Not a valid end message: ${end.message}`);
    }

    return new Switch(
      // Checked by isStart and isEnd.
      type as ChannelControlSwitch,
      start.ticks,
      end.ticks,
      channel
    );
  }

  override startEvent() {
    return {
      message: new ChannelControlMessage(this.pedal, true, this.channel),
      ticks: this.start,
    };
  }

  override endEvent() {
    return {
      message: new ChannelControlMessage(this.pedal, false, this.channel),
      ticks: this.end,
    };
  }
}

export interface SpanFactory<
  StartMessage extends Message,
  EndMessage extends Message,
> {
  getSpanKey(message: StartMessage | EndMessage): number;
  isStart(message: Message): message is StartMessage;
  isEnd(message: Message): message is EndMessage;
  create(
    start: Event<StartMessage>,
    end: Event<EndMessage>
  ): Span<StartMessage, EndMessage>;
}

KeyPress satisfies SpanFactory<NoteOn, NoteOff>;
Switch satisfies SpanFactory<ChannelControlMessage, ChannelControlMessage>;
