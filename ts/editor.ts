'use strict';

import {FileParser} from './message.js';
import {Note, NoteString} from './note.js';
import {Player} from './player.js';
import {PianoRenderer} from './rendering.js';
import {Selector} from './selector.js';
import {KeyPress, Span} from './song.js';
import {TempoMap} from './tempo.js';
import {elementDeps, sleep} from './utils.js';

type Melody = Span[];

const TOP_BAR_HEIGHT_PIXELS = 64;
const PIANO_HEIGHT_PIXELS = 64;
const GRID_SIZE = 2;
const KEY_GAP_COLOR = '#222';
const DEFAULT_TEMPO_MAP = TempoMap.builder(96).build();

interface EditorData {
  spans: Span[];
  tempo: TempoMap;
}

export class Editor {
  private readonly elements = elementDeps({
    body: HTMLBodyElement,
    melody: HTMLSelectElement,
    play: HTMLButtonElement,
    noteCanvas: HTMLCanvasElement,
    midiUpload: HTMLButtonElement,
    midiUploadInput: HTMLInputElement,
  });
  private readonly pianoRenderer = new PianoRenderer();
  private readonly player = new Player();

  private readonly melodies: Array<() => Melody> = [
    shoreline,
    scale,
    tone,
    chord,
    repeatedTone,
    repeatedChord,
    (() => this.editorData.spans).bind(this),
  ];
  private melody = this.melodies[0];
  private readonly melodySelector = new Selector(
    this.elements.melody,
    this.melodies,
    this.melody,
    (melody) => melody.name[0].toUpperCase() + melody.name.substring(1)
  );

  private editorData: EditorData = {
    spans: [],
    tempo: DEFAULT_TEMPO_MAP,
  };
  private moveStart: [number, number] | null = null;
  private drawContext = this.elements.noteCanvas.getContext('2d')!;

  constructor() {
    if (!this.drawContext) {
      throw new Error('Failed to set up canvas');
    }

    this.player.addEventListener('onmessage', (data) =>
      this.pianoRenderer.send(data)
    );
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
    this.elements.noteCanvas.addEventListener('mousedown', (e) =>
      this.onCanvasMouseDown(e)
    );
    this.elements.noteCanvas.addEventListener('mouseup', (e) =>
      this.onCanvasMouseUp(e)
    );
    this.elements.noteCanvas.addEventListener('click', (e) =>
      this.onCanvasClick(e)
    );
    this.elements.midiUpload.addEventListener('click', () =>
      this.elements.midiUploadInput.click()
    );
    this.elements.midiUploadInput.addEventListener('change', () =>
      this.onMidiUpload(this.elements.midiUploadInput.files?.item(0) ?? null)
    );
    this.elements.body.addEventListener('keydown', (e) => {
      switch (e.key) {
        case ' ':
          this.play();
          e.preventDefault();
          break;
      }
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
    const events = this.melody()
      .flatMap((s) => [s.startEvent(), s.endEvent()])
      .toSorted((a, b) => a.ticks - b.ticks);
    const duration =
      events.length > 0
        ? this.editorData.tempo.ticksToSeconds(events[events.length - 1].ticks)
        : 0;
    console.log(`Playing melody with duration ${duration} s`);

    for (let i = 0; i < events.length; i++) {
      if (i > 0 && events[i - 1].ticks < events[i].ticks) {
        const diffSeconds =
          this.editorData.tempo.ticksToSeconds(events[i].ticks) -
          this.editorData.tempo.ticksToSeconds(events[i - 1].ticks);
        await sleep(diffSeconds * 1000);
      }
      this.player.send(events[i].message);
    }
  }

  private onCanvasMouseDown(e: MouseEvent) {
    if (e.button === 0) {
      this.moveStart = [e.offsetX, e.offsetY];
      e.preventDefault();
    }
  }

  private onCanvasMouseUp(e: MouseEvent) {
    if (e.button === 0 && this.moveStart) {
      const note = this.pianoRenderer.getNote(e.offsetX);
      const start =
        QUARTER *
        Math.round(Math.min(this.moveStart[1], e.offsetY) / GRID_SIZE);
      const end =
        QUARTER *
        Math.max(
          1,
          Math.ceil(Math.max(this.moveStart[1], e.offsetY) / GRID_SIZE)
        );
      this.editorData.spans.push(
        new KeyPress(
          note,
          95,
          this.editorData.tempo.secondsToTicks(start),
          this.editorData.tempo.secondsToTicks(end)
        )
      );
      console.log(`Added note ${note} at ${start} with length ${end - start}`);
      this.moveStart = null;
      e.preventDefault();
    }
  }

  private onCanvasClick(e: PointerEvent) {
    if (e.button === 2) {
      const note = this.pianoRenderer.getNote(e.offsetX);
      const ticks = this.editorData.tempo.secondsToTicks(e.offsetY / GRID_SIZE);
      const index = this.editorData.spans.findIndex(
        (k) =>
          k instanceof KeyPress &&
          k.note.byteValue === note.byteValue &&
          k.start <= ticks &&
          ticks <= k.start + k.duration
      );
      if (index !== -1) {
        this.editorData.spans.splice(index, 1);
      }
      e.preventDefault();
    }
  }

  private async onMidiUpload(file: File | null) {
    if (!file) {
      return;
    }

    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener('loadend', () => {
        if (reader.error) {
          reject(reader.error);
        } else {
          resolve(reader.result as ArrayBuffer);
        }
      });
      reader.readAsArrayBuffer(file);
    });

    const parser = new FileParser(buffer);
    this.editorData = {spans: [], tempo: DEFAULT_TEMPO_MAP};
    parser.addEventListener('span', (span) => this.editorData.spans.push(span));
    parser.addEventListener('tempo', (tempo) => {
      this.editorData.tempo = tempo;
    });
    parser.parse();
    const numNotes = this.editorData.spans.filter(
      (s) => s instanceof KeyPress
    ).length;
    console.log(`Loaded melody with ${numNotes} notes`);
    for (let i = 0; i < 3; i++) {
      const span = this.editorData.spans[i];
      const startSeconds = this.editorData.tempo.ticksToSeconds(span.start);
      const endSeconds = this.editorData.tempo.ticksToSeconds(span.end);
      const label = span instanceof KeyPress ? span.note.toString() : 'other';
      console.log(`Span #${i}: ${label} ${startSeconds} s to ${endSeconds} s`);
    }

    // Select the uploaded melody in the dropdown.
    this.melodySelector.select(this.melodies[this.melodies.length - 1]);
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

    this.pianoRenderer.drawPianoTo(this.drawContext, 0, pianoStartY);
    this.pianoRenderer.drawPedalsTo(this.drawContext, 0, pianoStartY);

    this.drawContext.fillStyle = 'salmon';
    for (const span of this.editorData.spans) {
      if (!('note' in span)) {
        continue;
      }
      const [x0, x1] = this.pianoRenderer.getNoteCoords(
        (span as KeyPress).note
      );
      const y = (span.start * GRID_SIZE) / QUARTER;
      const h = (span.duration * GRID_SIZE) / QUARTER;
      this.drawContext.fillRect(x0, y, x1 - x0, h);
    }

    this.drawContext.restore();
    requestAnimationFrame((time) => this.draw(time));
  }
}

const QUARTER = DEFAULT_TEMPO_MAP.ticksPerQuarter;
const HALF = QUARTER * 2;
const FULL = QUARTER * 4;
const EIGHTH = QUARTER / 2;
const n = (strings: TemplateStringsArray) =>
  Note.fromString(strings[0] as NoteString);
const compileMelody = (notes: Array<[Note | null, number]>) => {
  const result: Melody = [];
  let start = 0;
  for (const [note, length] of notes) {
    if (note === null) {
      start += length;
      continue;
    }
    result.push(new KeyPress(note, 95, start, start + length));
  }

  return result;
};

function shoreline(): Melody {
  return compileMelody([
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
  ]);
}

function tone(): Melody {
  return compileMelody([
    [n`A4`, FULL],
    [null, FULL],
  ]);
}

function chord(): Melody {
  return compileMelody([
    [n`A4`, FULL],
    [n`Db5`, FULL],
    [n`E5`, FULL],
    [null, FULL],
  ]);
}

function repeatedTone(): Melody {
  const singleTone = [
    [n`A4`, QUARTER],
    [null, QUARTER],
  ];
  return compileMelody(new Array(8).fill(singleTone).flat());
}

function repeatedChord(): Melody {
  const singleChord = [
    [n`A4`, QUARTER],
    [n`Db5`, QUARTER],
    [n`E5`, QUARTER],
    [null, QUARTER],
  ];
  return compileMelody(new Array(8).fill(singleChord).flat());
}

function scale(): Melody {
  const notes = [n`C4`, n`D4`, n`E4`, n`F4`, n`G4`, n`A4`, n`B4`, n`C5`];
  return compileMelody(
    Array.from(notes.concat(notes.toReversed().slice(1)), (note) => [
      [note, QUARTER],
      [null, QUARTER],
    ]).flat() as Array<[Note | null, number]>
  );
}
