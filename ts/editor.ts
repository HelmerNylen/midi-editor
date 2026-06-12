'use strict';

import {NoteOff, NoteOn} from './message.js';
import {Note, NoteString} from './note.js';
import {Player} from './player.js';
import {PianoRenderer} from './rendering.js';
import {Selector} from './selector.js';
import {elementDeps, sleep} from './utils.js';

type Melody = Array<[Note | null, number]>;

const TOP_BAR_HEIGHT_PIXELS = 64;
const PIANO_HEIGHT_PIXELS = 64;
const WHITE_KEY_PRESSED_COLOR = 'salmon';
const BLACK_KEY_PRESSED_COLOR = 'salmon';
const KEY_GAP_COLOR = '#222';

export class Editor {
  private readonly elements = elementDeps({
    melody: HTMLSelectElement,
    play: HTMLButtonElement,
    noteCanvas: HTMLCanvasElement,
  });
  private readonly player = new Player();

  private readonly melodies: Array<() => Melody> = [
    shoreline,
    scale,
    tone,
    chord,
    repeatedTone,
    repeatedChord,
  ];
  private melody = this.melodies[0];
  private readonly melodySelector = new Selector(
    this.elements.melody,
    this.melodies,
    this.melody,
    (melody) => melody.name[0].toUpperCase() + melody.name.substring(1)
  );

  private readonly pianoRenderer = new PianoRenderer();
  private drawContext = this.elements.noteCanvas.getContext('2d')!;

  constructor() {
    if (!this.drawContext) {
      throw new Error('Failed to set up canvas');
    }

    this.melodySelector.addEventListener('select', (melody) => {
      if (melody) {
        this.melody = melody;
      }
    });
    this.elements.play.addEventListener('click', () => this.play());
    window.addEventListener('resize', () => this.resizeCanvas(), {
      passive: true,
    });
    this.elements.noteCanvas.addEventListener('wheel', ({deltaY, shiftKey}) => {
      const pianoRange = this.pianoRenderer.getRange();
      const index = +shiftKey;
      const delta = shiftKey !== deltaY > 0 ? -1 : 1;
      pianoRange[index] = pianoRange[index].transpose(delta);
      this.pianoRenderer.setRange({min: pianoRange[0], max: pianoRange[1]});
    });

    this.resizeCanvas();
    requestAnimationFrame((time) => this.draw(time));
  }

  private resizeCanvas() {
    this.elements.noteCanvas.width = window.innerWidth;
    this.elements.noteCanvas.height =
      window.innerHeight - TOP_BAR_HEIGHT_PIXELS;
    this.pianoRenderer.setSize({
      width: this.elements.noteCanvas.width,
      height: PIANO_HEIGHT_PIXELS,
    });
  }

  async play() {
    const melody = this.melody();
    const duration = melody.reduce(
      (sum, [note, length]) => (note === null ? sum + length : sum),
      0
    );
    console.log(`Playing ${this.melody.name} (duration: ${duration / 1000} s)`);

    for (const [note, length] of melody) {
      if (note) {
        this.player.send(new NoteOn(note, 95));
        sleep(length).then(() => this.player.send(new NoteOff(note)));
      } else {
        await sleep(length);
      }
    }
  }

  private draw(_: DOMHighResTimeStamp) {
    const width = this.elements.noteCanvas.width;
    const height = this.elements.noteCanvas.height;
    const pianoStartY = height - PIANO_HEIGHT_PIXELS;

    this.drawContext.clearRect(0, 0, width, height);
    this.drawContext.save();

    // Draw lines between white keys.
    this.drawContext.fillStyle = KEY_GAP_COLOR;
    this.drawContext.fillRect(0, pianoStartY, width, PIANO_HEIGHT_PIXELS);

    const notes = this.player.synthesizer
      .getCurrentlyPressed()
      .map((n) => new Note(n));

    this.pianoRenderer.drawWhiteKeys(this.drawContext, 0, pianoStartY);
    this.drawContext.fillStyle = WHITE_KEY_PRESSED_COLOR;
    for (const note of notes) {
      if (note.isWhite) {
        const [keyStart, keyEnd] = this.pianoRenderer.getNoteCoords(note);
        this.drawContext.fillRect(
          keyStart,
          pianoStartY,
          keyEnd - keyStart,
          PIANO_HEIGHT_PIXELS
        );
      }
    }

    this.pianoRenderer.drawBlackKeys(this.drawContext, 0, pianoStartY);
    this.drawContext.fillStyle = BLACK_KEY_PRESSED_COLOR;
    const blackKeyHeight = this.pianoRenderer.getBlackKeyHeight();
    for (const note of notes) {
      if (!note.isWhite) {
        const [keyStart, keyEnd] = this.pianoRenderer.getNoteCoords(note);
        this.drawContext.fillRect(
          keyStart,
          pianoStartY,
          keyEnd - keyStart,
          blackKeyHeight
        );
      }
    }

    // Pedal state
    if (this.player.synthesizer.getSustain()) {
      this.drawContext.fillStyle = WHITE_KEY_PRESSED_COLOR;
      this.drawContext.font = '18px sans-serif';
      this.drawContext.fillText('Sustain', 8, pianoStartY - 8);
    }

    this.drawContext.restore();
    requestAnimationFrame((time) => this.draw(time));
  }
}

const BPM = 120;
const FULL = (4 * 60000) / BPM;
const HALF = FULL / 2;
const QUARTER = FULL / 4;
const EIGHTH = FULL / 8;
const n = (strings: TemplateStringsArray) =>
  Note.fromString(strings[0] as NoteString);

function shoreline(): Melody {
  return [
    [n`G3`, FULL],
    [n`Bb3`, FULL],
    [n`D4`, FULL],
    [n`D5`, QUARTER],
    [null, QUARTER],
    [n`D5`, EIGHTH],
    [null, EIGHTH],
    [n`D5`, QUARTER],
    [null, QUARTER],
    [n`G3`, EIGHTH],
    [n`Bb4`, EIGHTH],
    [null, EIGHTH],
    [n`Bb3`, EIGHTH],
    [n`D4`, EIGHTH],
    [n`Bb4`, QUARTER],
    [null, EIGHTH],
    [n`G3`, EIGHTH],
    [null, EIGHTH],

    [n`F3`, HALF],
    [n`Bb3`, HALF],
    [n`D4`, HALF],
    [n`Eb5`, QUARTER],
    [null, QUARTER],
    [n`D5`, QUARTER],
    [null, QUARTER],
    [n`F3`, QUARTER],
    [n`A3`, QUARTER],
    [n`C4`, QUARTER],
    [n`C5`, QUARTER],
    [null, QUARTER],
    [n`F3`, EIGHTH],
    [null, EIGHTH],
    [n`A3`, EIGHTH],
    [n`C4`, EIGHTH],
    [null, EIGHTH],

    [n`G3`, QUARTER],
    [n`Bb3`, QUARTER + EIGHTH],
    [n`Eb4`, QUARTER + EIGHTH],
    [n`G5`, QUARTER],
    [null, QUARTER],
    [n`G3`, EIGHTH],
    [n`G5`, EIGHTH],
    [null, EIGHTH],
    [n`Bb3`, QUARTER],
    [n`Eb4`, QUARTER],
    [n`G5`, QUARTER],
    [null, QUARTER],
    [n`G3`, EIGHTH],
    [n`F5`, EIGHTH],
    [null, EIGHTH],
    [n`Bb3`, EIGHTH],
    [n`Eb4`, EIGHTH],
    [n`F5`, QUARTER],
    [null, EIGHTH],
    [n`G3`, EIGHTH],
    [null, EIGHTH],

    [n`F3`, QUARTER],
    [n`Bb3`, QUARTER],
    [n`D4`, QUARTER],
    [n`D5`, HALF],
    [null, QUARTER],
    [n`F3`, EIGHTH],
    [null, EIGHTH],
    [n`Bb3`, EIGHTH],
    [n`D4`, EIGHTH],
    [null, EIGHTH],
    [n`F3`, QUARTER],
    [n`A3`, QUARTER],
    [n`C4`, QUARTER],
    [n`C5`, QUARTER + EIGHTH],
    [null, QUARTER],
    [n`F3`, EIGHTH],
    [null, EIGHTH],
    [n`A3`, EIGHTH],
    [n`C4`, EIGHTH],
    [null, EIGHTH],
  ];
}

function tone(): Melody {
  return [
    [n`A4`, FULL],
    [null, FULL],
  ];
}

function chord(): Melody {
  return [
    [n`A4`, FULL],
    [n`Db5`, FULL],
    [n`E5`, FULL],
    [null, FULL],
  ];
}

function repeatedTone(): Melody {
  const singleTone = [
    [n`A4`, QUARTER],
    [null, QUARTER],
  ];
  return new Array(8).fill(singleTone).flat();
}

function repeatedChord(): Melody {
  const singleChord = [
    [n`A4`, QUARTER],
    [n`Db5`, QUARTER],
    [n`E5`, QUARTER],
    [null, QUARTER],
  ];
  return new Array(8).fill(singleChord).flat();
}

function scale(): Melody {
  const notes = [n`C4`, n`D4`, n`E4`, n`F4`, n`G4`, n`A4`, n`B4`, n`C5`];
  return Array.from(notes.concat(notes.toReversed().slice(1)), (note) => [
    [note, QUARTER],
    [null, QUARTER],
  ]).flat() as Melody;
}
