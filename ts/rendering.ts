'use strict';

import {
  ChannelControlSwitch,
  ChannelControlType,
  MessageParser,
} from './message.js';
import {Note} from './note.js';

/**
 * Key coordinates on the x axis relative to the octave. The left edge of the C
 * key is at 0, and the right edge of the B key is at 1.
 */
const NOTE_COORDS: ReadonlyArray<[number, number]> = [
  [0, 1 / 7], // C
  [(1 / 5) * (3 / 7), (2 / 5) * (3 / 7)], // Db
  [1 / 7, 2 / 7], // D
  [(3 / 5) * (3 / 7), (4 / 5) * (3 / 7)], // Eb
  [2 / 7, 3 / 7], // E
  [3 / 7, 4 / 7], // F
  [3 / 7 + (1 / 7) * (4 / 7), 3 / 7 + (2 / 7) * (4 / 7)], // Gb
  [4 / 7, 5 / 7], // G
  [3 / 7 + (3 / 7) * (4 / 7), 3 / 7 + (4 / 7) * (4 / 7)], // Ab
  [5 / 7, 6 / 7], // A
  [3 / 7 + (5 / 7) * (4 / 7), 3 / 7 + (6 / 7) * (4 / 7)], // Bb
  [6 / 7, 1], // B
];

const PEDAL_NAMES: ReadonlyMap<ChannelControlSwitch, string> = new Map([
  [ChannelControlType.SOFT, 'Soft'],
  [ChannelControlType.SOSTENUTO, 'Sostenuto'],
  [ChannelControlType.SUSTAIN, 'Sustain'],
]);

interface MutableNote extends Note {
  byteValue: number;
}

interface RenderingParameters {
  /** The width in pixels of a full octave. */
  pixelsPerOctave: number;
  /**
   * The offset in octaves at which the lowest possible note would be rendered.
   */
  octaveOffset: number;
}

export class PianoRenderer {
  private minimumNote = Note.fromString('A0');
  private maximumNote = Note.fromString('C8');
  private blackKeyHeightRatio = 0.55;
  private blackKeyColor = 'black';
  private blackKeyPressedColor = 'salmon';
  private whiteKeyColor = 'white';
  private whiteKeyPressedColor = 'salmon';
  private whiteKeyGapPixels = 2;

  private dirty = false;
  private renderingParameters: RenderingParameters | null = null;
  private readonly whiteKeys = document.createElement('canvas');
  private readonly blackKeys = document.createElement('canvas');
  private readonly whiteKeysContext = this.whiteKeys.getContext('2d')!;
  private readonly blackKeysContext = this.blackKeys.getContext('2d')!;

  private readonly messageParser = new MessageParser();
  private readonly pressed = new Map<number, Note>();
  private readonly switches = new Set<ChannelControlSwitch>();

  constructor() {
    this.messageParser.addEventListener('noteOn', ({note}) => {
      this.pressed.set(note.byteValue, note);
    });
    this.messageParser.addEventListener('noteOff', ({note}) => {
      this.pressed.delete(note.byteValue);
    });
    this.messageParser.addEventListener('channelControl', ({type, data}) => {
      switch (type) {
        case ChannelControlType.SUSTAIN:
        case ChannelControlType.PORTAMENTO:
        case ChannelControlType.SOSTENUTO:
        case ChannelControlType.SOFT:
        case ChannelControlType.LEGATO:
        case ChannelControlType.HOLD_2:
        case ChannelControlType.LOCAL_CONTROL:
          if (data >= 0x40) {
            this.switches.add(type);
          } else {
            this.switches.delete(type);
          }
          break;
        case ChannelControlType.ALL_NOTES_OFF:
        case ChannelControlType.ALL_SOUND_OFF:
          this.pressed.clear();
          break;
        case ChannelControlType.RESET_ALL_CONTROLLERS:
          this.pressed.clear();
          this.switches.clear();
          break;
      }
    });
  }

  send(data: Iterable<number>) {
    this.messageParser.send(data);
  }

  /** Gets the [minimum, maximum] note rendered in the piano. */
  getRange(): [Note, Note] {
    return [this.minimumNote, this.maximumNote];
  }

  setRange({
    min = this.minimumNote,
    max = this.maximumNote,
  }: {
    min?: Note;
    max?: Note;
  }) {
    if (!(min.byteValue <= max.byteValue)) {
      throw new Error(
        `Minimum note must be lower than maximum, got range [${min}, ${max}]`
      );
    }
    if (min.byteValue !== this.minimumNote.byteValue) {
      this.minimumNote = min;
      this.renderingParameters = null;
      this.dirty = true;
    }
    if (max.byteValue !== this.maximumNote.byteValue) {
      this.maximumNote = max;
      this.renderingParameters = null;
      this.dirty = true;
    }
  }

  /** Gets the [width, height] of the piano. */
  getSize(): [number, number] {
    return [this.whiteKeys.width, this.whiteKeys.height];
  }

  setSize({
    width = this.whiteKeys.width,
    height = this.whiteKeys.height,
  }: {
    width?: number;
    height?: number;
  }) {
    if (width !== this.whiteKeys.width) {
      this.whiteKeys.width = width;
      this.blackKeys.width = width;
      this.renderingParameters = null;
      this.dirty = true;
    }
    if (height !== this.whiteKeys.height) {
      this.whiteKeys.height = height;
      this.blackKeys.height = Math.ceil(height * this.blackKeyHeightRatio);
      this.renderingParameters = null;
      this.dirty = true;
    }
  }

  private updateRenderingParameters() {
    const minWhite = this.minimumNote.isWhite
      ? this.minimumNote
      : this.minimumNote.transpose(1);
    const maxWhite = this.maximumNote.isWhite
      ? this.maximumNote
      : this.maximumNote.transpose(-1);

    const octavesWidth =
      maxWhite.octave -
      minWhite.octave +
      NOTE_COORDS[maxWhite.key][1] -
      NOTE_COORDS[minWhite.key][0];

    this.renderingParameters = {
      pixelsPerOctave: this.whiteKeys.width / octavesWidth,
      octaveOffset: -minWhite.octave - NOTE_COORDS[minWhite.key][0],
    };
  }

  /** Returns the note coordinates in pixels along the X axis. */
  getNoteCoords(note: Note): [number, number] {
    if (!this.renderingParameters) {
      this.updateRenderingParameters();
    }

    const gapAdjustment = note.isWhite ? this.whiteKeyGapPixels / 2 : 0;
    const octaveStart = note.octave + this.renderingParameters!.octaveOffset;
    const [start, end] = NOTE_COORDS[note.key];
    return [
      Math.floor(
        (octaveStart + start) * this.renderingParameters!.pixelsPerOctave +
          gapAdjustment
      ),
      Math.floor(
        (octaveStart + end) * this.renderingParameters!.pixelsPerOctave -
          gapAdjustment
      ),
    ];
  }

  /** Gets the note corresponding to the provided x coordinate in pixels. */
  getNote(x: number): Note {
    if (!this.renderingParameters) {
      this.updateRenderingParameters();
    }
    if (this.whiteKeys.width === 0) {
      return this.minimumNote;
    }

    // TODO: We could maybe do something fancier.
    const byteValue =
      this.minimumNote.byteValue +
      (this.maximumNote.byteValue + 1 - this.minimumNote.byteValue) *
        (x / this.whiteKeys.width);
    return new Note(
      Math.min(this.maximumNote.byteValue, Math.floor(byteValue))
    );
  }

  private maybeUpdateCanvases() {
    if (!this.dirty) {
      return;
    }

    this.whiteKeysContext.clearRect(
      0,
      0,
      this.whiteKeys.width,
      this.whiteKeys.height
    );
    this.blackKeysContext.clearRect(
      0,
      0,
      this.blackKeys.width,
      this.blackKeys.height
    );
    this.whiteKeysContext.fillStyle = this.whiteKeyColor;
    this.blackKeysContext.fillStyle = this.blackKeyColor;

    const note: MutableNote = new Note(this.minimumNote.byteValue);
    for (; note.byteValue <= this.maximumNote.byteValue; note.byteValue++) {
      const [keyStart, keyEnd] = this.getNoteCoords(note);
      if (note.isWhite) {
        this.whiteKeysContext.fillRect(
          keyStart,
          0,
          keyEnd - keyStart,
          this.whiteKeys.height
        );
      } else {
        this.blackKeysContext.fillRect(
          keyStart,
          0,
          keyEnd - keyStart,
          this.blackKeys.height
        );
      }
    }

    this.dirty = false;
  }

  drawPianoTo(context: CanvasRenderingContext2D, x: number, y: number) {
    context.save();
    this.maybeUpdateCanvases();

    context.drawImage(this.whiteKeys, x, y);
    context.fillStyle = this.whiteKeyPressedColor;
    for (const note of this.pressed.values()) {
      if (note.isWhite) {
        const [keyStart, keyEnd] = this.getNoteCoords(note);
        context.fillRect(
          x + keyStart,
          y,
          keyEnd - keyStart,
          this.whiteKeys.height
        );
      }
    }

    context.drawImage(this.blackKeys, x, y);
    context.fillStyle = this.blackKeyPressedColor;
    for (const note of this.pressed.values()) {
      if (!note.isWhite) {
        const [keyStart, keyEnd] = this.getNoteCoords(note);
        context.fillRect(
          x + keyStart,
          y,
          keyEnd - keyStart,
          this.blackKeys.height
        );
      }
    }

    context.restore();
  }

  drawPedalsTo(context: CanvasRenderingContext2D, x: number, y: number) {
    // TODO: This is not very pretty.
    context.save();
    context.fillStyle = 'salmon';
    context.font = '18px sans-serif';
    const padding = 8;

    let offset = 0;
    for (const pedal of this.switches) {
      const name = PEDAL_NAMES.get(pedal);
      if (name) {
        context.fillText(name, x + padding + offset, y - padding);
        offset += context.measureText(name).width + padding;
      }
    }
    context.restore();
  }
}
