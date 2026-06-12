'use strict';

export enum Key {
  C = 0,
  Db = 1,
  D = 2,
  Eb = 3,
  E = 4,
  F = 5,
  Gb = 6,
  G = 7,
  Ab = 8,
  A = 9,
  Bb = 10,
  B = 11,
}

// Don't bother with representing F as E# or B as Cb in F#/Gb.
const KEY_LABELS: ReadonlyArray<[string, string]> = [
  ['C', 'C'],
  ['C♯', 'D♭'],
  ['D', 'D'],
  ['D♯', 'E♭'],
  ['E', 'E'],
  ['F', 'F'],
  ['F♯', 'G♭'],
  ['G', 'G'],
  ['G♯', 'A♭'],
  ['A', 'A'],
  ['A♯', 'B♭'],
  ['B', 'B'],
];

export function usesFlats(keySignature: Key): boolean {
  switch (keySignature) {
    case Key.C:
    case Key.G:
    case Key.D:
    case Key.A:
    case Key.E:
    case Key.B:
    case Key.Gb:
      return false;
    default:
      return true;
  }
}

export function keyLabel(key: Key, keySignature: Key = Key.C): string {
  return KEY_LABELS[key][+usesFlats(keySignature)];
}

export type NoteString = Exclude<
  `${keyof typeof Key}${-1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`,
  'Ab9' | 'A9' | 'Bb9' | 'B9'
>;

export class Note {
  constructor(readonly byteValue: number) {
    if (byteValue !== (byteValue & 0x7f)) {
      throw new Error(
        `Byte value must be integer in the range [0, 127], got: ${byteValue}`
      );
    }
  }

  get key(): Key {
    return this.byteValue % 12;
  }

  get octave(): number {
    return Math.floor(this.byteValue / 12) - 1;
  }

  get frequency(): number {
    return 440 * Math.pow(2, (this.byteValue - A440_BYTE_VALUE) / 12);
  }

  get isWhite(): boolean {
    const key = this.key;
    return !(key & 1) !== key > Key.E;
  }

  static fromKeyAndOctave(key: Key, octave: number): Note {
    return new Note(key + (octave + 1) * 12);
  }

  static fromString(string: NoteString): Note {
    const keyString = string.substring(0, string[1] === 'b' ? 2 : 1);
    const octaveString = string.substring(keyString.length);

    return this.fromKeyAndOctave(
      Key[keyString as keyof typeof Key],
      Number(octaveString)
    );
  }

  transpose(semitones: number): Note {
    return new Note(this.byteValue + semitones);
  }

  toString(): NoteString {
    return (Key[this.key] + this.octave) as NoteString;
  }
}

const A440_BYTE_VALUE = Note.fromString('A4').byteValue;
