'use strict';

export interface TempoMapBuilder {
  build(): TempoMap;
  addChange(ticks: number, microsecondsPerQuarter: number): this;
  length: number;
}

export class TempoMap {
  readonly supportsTempoChanges = true;

  private constructor(
    readonly ticksPerQuarter: number,
    private readonly tempoChanges: readonly TempoChange[]
  ) {}

  static builder(ticksPerQuarter: number, log = false): TempoMapBuilder {
    // TODO: Could use checkValidData if not for circular imports.
    if (!(ticksPerQuarter > 0)) {
      throw new Error(
        `Ticks per quarter must be positive, got: ${ticksPerQuarter}`
      );
    }
    if (ticksPerQuarter !== (ticksPerQuarter & 0x7fff)) {
      throw new Error(`Ticks per quarter must fit in 15 bit integer`);
    }

    const tempoChanges: TempoChange[] = [];
    return {
      addChange(ticks, microsecondsPerQuarter) {
        const lastChange = tempoChanges.length
          ? tempoChanges[tempoChanges.length - 1]
          : DEFAULT_TEMPO;
        if (!(ticks >= lastChange.ticks)) {
          throw new Error(
            `Tempo changes must be provided in non-decreasing order, got ` +
              `ticks: ${ticks} (last ${lastChange.ticks})`
          );
        }
        if (!(microsecondsPerQuarter > 0)) {
          throw new Error(
            `Tempo must be positive, got: ${microsecondsPerQuarter} ` +
              `[us/quarter]`
          );
        }

        const seconds = lastChange.ticksToSeconds(ticks, ticksPerQuarter);
        const tempoChange = new TempoChange(
          ticks,
          seconds,
          microsecondsPerQuarter
        );

        if (log) {
          const bpm = (60 * 1e6) / microsecondsPerQuarter;
          console.log(`Tempo at ${seconds} s: ${bpm.toFixed(1)} BPM`);
        }

        if (ticks === lastChange.ticks && tempoChanges.length) {
          console.warn(
            `Simultaneous tempo changes at ${ticks} ticks (${seconds} s). ` +
              `Keeping the last.`
          );
          tempoChanges[tempoChanges.length - 1] = tempoChange;
        } else {
          tempoChanges.push(tempoChange);
        }
        return this;
      },
      build() {
        if (log) {
          console.log(
            `Built tempo map with ${tempoChanges.length} changes:`,
            tempoChanges
          );
        }
        return new TempoMap(ticksPerQuarter, tempoChanges);
      },
      get length() {
        return tempoChanges.length;
      },
    };
  }

  // TODO: Either export TempoChange or don't make these public.
  tempoAtTicks(ticks: number): TempoChange {
    if (!(ticks >= 0)) {
      throw new Error(`Ticks must be non-negative, got: ${ticks}`);
    }

    let relevantTempoChange = DEFAULT_TEMPO;
    for (let i = this.tempoChanges.length - 1; i >= 0; i--) {
      if (ticks >= this.tempoChanges[i].ticks) {
        relevantTempoChange = this.tempoChanges[i];
        break;
      }
    }
    return relevantTempoChange;
  }

  tempoAtSeconds(seconds: number): TempoChange {
    if (!(seconds >= 0)) {
      throw new Error(`Seconds must be non-negative, got: ${seconds}`);
    }

    let relevantTempoChange = DEFAULT_TEMPO;
    for (let i = this.tempoChanges.length - 1; i >= 0; i--) {
      if (seconds >= this.tempoChanges[i].seconds) {
        relevantTempoChange = this.tempoChanges[i];
        break;
      }
    }
    return relevantTempoChange;
  }

  ticksToSeconds(ticks: number): number {
    return this.tempoAtTicks(ticks).ticksToSeconds(ticks, this.ticksPerQuarter);
  }

  secondsToTicks(seconds: number): number {
    return this.tempoAtSeconds(seconds).secondsToTicks(
      seconds,
      this.ticksPerQuarter
    );
  }

  getDivision(): Uint8Array {
    return new Uint8Array([
      (this.ticksPerQuarter >> 8) & 0x7f,
      this.ticksPerQuarter & 0xff,
    ]);
  }
}

class TempoChange {
  constructor(
    readonly ticks: number,
    readonly seconds: number,
    readonly microsecondsPerQuarter: number
  ) {}

  ticksToSeconds(ticks: number, ticksPerQuarter: number): number {
    const deltaQuarters = (ticks - this.ticks) / ticksPerQuarter;
    return this.seconds + deltaQuarters * this.microsecondsPerQuarter * 1e-6;
  }

  secondsToTicks(seconds: number, ticksPerQuarter: number): number {
    const deltaQuarters =
      (1e6 * (seconds - this.seconds)) / this.microsecondsPerQuarter;
    return this.ticks + deltaQuarters * ticksPerQuarter;
  }
}

/** The default tempo is 120 BPM. */
const DEFAULT_TEMPO = new TempoChange(0, 0, 500000);
