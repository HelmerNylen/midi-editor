'use strict';

export interface TempoMapBuilder {
  build(): TempoMap;
  addChange(ticks: number, microsecondsPerQuarter: number): this;
  length: number;
}

export class TempoMap {
  private constructor(
    readonly ticksPerQuarter: number,
    private readonly tempoChanges: TempoChange[]
  ) {}

  static builder(ticksPerQuarter: number): TempoMapBuilder {
    if (!(ticksPerQuarter > 0)) {
      throw new Error(
        `Ticks per quarter must be positive, got: ${ticksPerQuarter}`
      );
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

        const deltaQuarters = (ticks - lastChange.ticks) / ticksPerQuarter;
        const seconds =
          lastChange.seconds + deltaQuarters * microsecondsPerQuarter * 1e-6;
        const tempoChange = new TempoChange(
          ticks,
          seconds,
          microsecondsPerQuarter
        );
        console.log(
          `Tempo at ${seconds} s: ${60000000 / microsecondsPerQuarter} BPM`
        );

        if (deltaQuarters === 0 && tempoChanges.length) {
          console.warn(
            `Simultaneous tempo changes at ${ticks} ticks. Keeping the last.`
          );
          tempoChanges[tempoChanges.length - 1] = tempoChange;
        } else {
          tempoChanges.push(tempoChange);
        }
        return this;
      },
      build() {
        console.log(
          `Built tempo map with ${tempoChanges.length} changes:`,
          tempoChanges
        );
        return new TempoMap(ticksPerQuarter, tempoChanges);
      },
      get length() {
        return tempoChanges.length;
      },
    };
  }

  ticksToSeconds(ticks: number): number {
    if (!(ticks >= 0)) {
      throw new Error(`Ticks must be non-negative, got: ${ticks}`);
    }
    const relevantTempoChange =
      this.tempoChanges.findLast((tempoChange) => ticks >= tempoChange.ticks) ??
      DEFAULT_TEMPO;
    const deltaQuarters =
      (ticks - relevantTempoChange.ticks) / this.ticksPerQuarter;
    return (
      relevantTempoChange.seconds +
      deltaQuarters * relevantTempoChange.microsecondsPerQuarter * 1e-6
    );
  }

  secondsToTicks(seconds: number): number {
    if (!(seconds >= 0)) {
      throw new Error(`Seconds must be non-negative, got: ${seconds}`);
    }
    const relevantTempoChange =
      this.tempoChanges.findLast(
        (tempoChange) => seconds >= tempoChange.seconds
      ) ?? DEFAULT_TEMPO;
    const deltaQuarters =
      (1e6 * (seconds - relevantTempoChange.seconds)) /
      relevantTempoChange.microsecondsPerQuarter;
    return relevantTempoChange.ticks + deltaQuarters * this.ticksPerQuarter;
  }
}

class TempoChange {
  constructor(
    readonly ticks: number,
    readonly seconds: number,
    readonly microsecondsPerQuarter: number
  ) {}
}

/** The default tempo is 120 BPM. */
const DEFAULT_TEMPO = new TempoChange(0, 0, 500000);
