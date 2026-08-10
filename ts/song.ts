'use strict';

import {
  Instrument,
  MetaEvent,
  SystemMessage,
  writeUintN,
} from './message.js';

class Song {
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

class Track {
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
      .concat(
        this.spans.map((span) => ({
          ticks: span.startTicks,
          serialize: () => span.serializeStart(),
        }))
      )
      .concat(
        this.spans.map((span) => ({
          ticks: span.endTicks,
          serialize: () => span.serializeEnd(),
        }))
      );
    events.sort((a, b) => a.ticks - b.ticks);

    let lastTicks = 0;
    let totalBytes = 0;
    const buffers = new Array<Uint8Array>(events.length * 2 + 1);
    // TODO: Could implement running status.
    for (let i = 0; i < events.length; i++) {
      const delta = events[i].ticks - lastTicks;
      const buffer = new ArrayBuffer(4);
      const length = writeUintN(new DataView(buffer), 0, delta);
      const serialized = events[i].serialize();
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

export interface Event {
  /**
   * The number of ticks from the start of the track at which the event occurs.
   */
  ticks: number;
  /**
   * Serializes the event (without delta-ticks) to an array of bytes.
   */
  serialize(): Uint8Array;
}

export interface Span {
  /**
   * Determines what the span controls (e.g. a certain controller setting or
   * key). Two spans with the same spanKey may not overlap.
   */
  spanKey: number;
  /**
   * The number of ticks from the start of the track at which the span begins.
   */
  startTicks: number;
  /**
   * The number of ticks from the start of the track at which the span ends.
   */
  endTicks: number;
  /**
   * Serializes the event signifying the start of the span (without delta-ticks)
   * to an array of bytes.
   */
  serializeStart(): Uint8Array;
  /**
   * Serializes the event signifying the end of the span (without delta-ticks)
   * to an array of bytes.
   */
  serializeEnd(): Uint8Array;
}
