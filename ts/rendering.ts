'use strict';

import {TypedEventTarget} from './event.js';
import {
  ChannelControlSwitch,
  ChannelControlType,
  MessageParser,
} from './message.js';
import {Note} from './note.js';

type KeyCoordsArray = ReadonlyArray<[number, number]>;

/**
 * Key coordinates on the x axis relative to the octave. The left edge of the C
 * key is at 0, and the right edge of the B key is at 1.
 */
const KEY_COORDS_BOTTOM: KeyCoordsArray = [
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
const KEY_COORDS_EQUALIZED_BOTTOM: KeyCoordsArray = [
  [0, 1.5 / 12], // C
  [1 / 12, 2 / 12], // Db
  [1.5 / 12, 3.5 / 12], // D
  [3 / 12, 4 / 12], // Eb
  [3.5 / 12, 5 / 12], // E
  [5 / 12, 6.5 / 12], // F
  [6 / 12, 7 / 12], // Gb
  [6.5 / 12, 8.5 / 12], // G
  [8 / 12, 9 / 12], // Ab
  [8.5 / 12, 10.5 / 12], // A
  [10 / 12, 11 / 12], // Bb
  [10.5 / 12, 1], // B
];
const KEY_COORDS_EQUALIZED_TOP: KeyCoordsArray = Array.from(
  new Array(12),
  (_, i) => [i / 12, (i + 1) / 12]
);

const PEDAL_NAMES: ReadonlyMap<ChannelControlSwitch, string> = new Map([
  [ChannelControlType.SOFT, 'Soft'],
  [ChannelControlType.SOSTENUTO, 'Sostenuto'],
  [ChannelControlType.SUSTAIN, 'Sustain'],
]);

class PianoState extends TypedEventTarget<{
  whiteKeyChange: void;
  blackKeyChange: void;
  switchChange: void;
}> {
  private readonly messageParser = new MessageParser();
  private readonly pressed = new Map<number, Note>();
  private readonly switches = new Set<ChannelControlSwitch>();

  constructor() {
    super();
    this.messageParser.addEventListener('noteOn', ({note}) => {
      this.pressed.set(note.byteValue, note);
      this.dispatchEvent(note.isWhite ? 'whiteKeyChange' : 'blackKeyChange');
    });
    this.messageParser.addEventListener('noteOff', ({note}) => {
      this.pressed.delete(note.byteValue);
      this.dispatchEvent(note.isWhite ? 'whiteKeyChange' : 'blackKeyChange');
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
          this.dispatchEvent('switchChange');
          break;
        case ChannelControlType.ALL_NOTES_OFF:
        case ChannelControlType.ALL_SOUND_OFF:
          this.pressed.clear();
          this.dispatchEvent('whiteKeyChange');
          this.dispatchEvent('blackKeyChange');
          break;
        case ChannelControlType.RESET_ALL_CONTROLLERS:
          this.pressed.clear();
          this.switches.clear();
          this.dispatchEvent('whiteKeyChange');
          this.dispatchEvent('blackKeyChange');
          this.dispatchEvent('switchChange');
          break;
      }
    });
  }

  send(data: Iterable<number>) {
    this.messageParser.send(data);
  }

  getPressed(): Iterable<Note> {
    return this.pressed.values();
  }

  isPressed(note: Note): boolean {
    return this.pressed.has(note.byteValue);
  }

  getSwitches(): Iterable<ChannelControlSwitch> {
    return this.switches;
  }
}

interface Dimensions {
  width: number;
  height: number;
}

type SetterEvents<Params> = {
  [Param in keyof Params as `set${Capitalize<Param & string>}`]: Params[Param];
};

function toSetterEvent<Params>(
  param: keyof Params & string
): keyof SetterEvents<Params> {
  return ('set' +
    param.charAt(0).toUpperCase() +
    param.substring(1)) as keyof SetterEvents<Params>;
}

abstract class LazyRenderer<
  Params extends Dimensions = Dimensions,
> extends TypedEventTarget<SetterEvents<Params>> {
  private readonly canvas: OffscreenCanvas;
  protected readonly context: OffscreenCanvasRenderingContext2D;
  private dirty = true;

  constructor(private readonly mutableParams: Params) {
    super();
    this.canvas = new OffscreenCanvas(
      mutableParams.width,
      mutableParams.height
    );
    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error(`Failed to get 2d canvas rendering context`);
    }
    this.context = context;

    this.addEventListener('setWidth', (width) => {
      if (width !== this.canvas.width) {
        this.canvas.width = width as number;
      }
    });
    this.addEventListener('setHeight', (height) => {
      if (height !== this.canvas.height) {
        this.canvas.height = height as number;
      }
    });
  }

  setParam<Param extends keyof Params & string>(
    param: Param,
    value: Params[NoInfer<Param>]
  ) {
    if (this.mutableParams[param] !== value) {
      this.mutableParams[param] = value;
      const event = toSetterEvent<Params>(param);
      this.dispatchEvent(
        event,
        value as unknown as SetterEvents<Params>[typeof event]
      );
      this.markDirty();
    }
  }

  get params(): Readonly<Params> {
    return this.mutableParams;
  }

  get width(): number {
    return this.canvas.width;
  }

  get height(): number {
    return this.canvas.height;
  }

  markDirty() {
    this.dirty = true;
  }

  protected abstract refresh(): void;

  drawTo(targetContext: CanvasDrawImage, x: number, y: number) {
    if (this.dirty) {
      this.refresh();
      this.dirty = false;
    }
    targetContext.drawImage(this.canvas, x, y);
  }
}

interface Bounds<T> {
  min: T;
  max: T;
}

interface KeysRendererParams extends Dimensions {
  range: Bounds<Note>;
  equalizeKeyWidths: boolean;
  color: string;
  pressedColor: string;
  marginPixels: number;
}

interface MutableNote extends Note {
  byteValue: number;
}

interface ComputedParams {
  /** The width in pixels of a full octave. */
  pixelsPerOctave: number;
  /**
   * The offset in octaves at which the lowest possible note would be rendered.
   */
  octaveOffset: number;
}

class KeysRenderer extends LazyRenderer<KeysRendererParams> {
  protected computedParams: ComputedParams;

  constructor(
    params: KeysRendererParams,
    private readonly state: PianoState,
    private readonly renderWhite: boolean
  ) {
    super(params);
    this.computedParams = this.computeParams();
    this.addEventListener('setWidth', () => {
      this.computedParams = this.computeParams();
    });
    this.addEventListener('setEqualizeKeyWidths', () => {
      this.computedParams = this.computeParams();
    });
    this.addEventListener('setRange', () => {
      this.computedParams = this.computeParams();
    });

    this.state.addEventListener(
      renderWhite ? 'whiteKeyChange' : 'blackKeyChange',
      () => this.markDirty()
    );
  }

  private computeParams(): ComputedParams {
    let {min, max} = this.params.range;
    if (!this.params.equalizeKeyWidths) {
      // Under normal rendering, always start and end on white keys.
      min = min.isWhite ? min : min.transpose(1);
      max = max.isWhite ? max : max.transpose(-1);
    }
    // Under normal rendering, lone white keys (e.g. C8 with the standard range)
    // should be rendered in full width. With equalized note widths, this is
    // undesirable.
    const keyCoords = this.params.equalizeKeyWidths
      ? KEY_COORDS_EQUALIZED_TOP
      : KEY_COORDS_BOTTOM;

    const octavesWidth =
      max.octave - min.octave + keyCoords[max.key][1] - keyCoords[min.key][0];

    return {
      pixelsPerOctave: this.width / octavesWidth,
      octaveOffset: -min.octave - keyCoords[min.key][0],
    };
  }

  /** Returns the left edge of the provided note in pixels. */
  getLeftNoteEdge(note: Note, keyCoords?: KeyCoordsArray) {
    keyCoords ??= this.params.equalizeKeyWidths
      ? KEY_COORDS_EQUALIZED_TOP
      : KEY_COORDS_BOTTOM;
    const octaveStart = note.octave + this.computedParams.octaveOffset;
    const start = keyCoords[note.key][0];
    return Math.floor(
      (octaveStart + start) * this.computedParams.pixelsPerOctave +
        this.params.marginPixels
    );
  }

  /** Returns the right edge of the provided note in pixels. */
  getRightNoteEdge(note: Note, keyCoords?: KeyCoordsArray) {
    keyCoords ??= this.params.equalizeKeyWidths
      ? KEY_COORDS_EQUALIZED_TOP
      : KEY_COORDS_BOTTOM;
    const octaveStart = note.octave + this.computedParams.octaveOffset;
    const end = keyCoords[note.key][1];
    return Math.floor(
      (octaveStart + end) * this.computedParams.pixelsPerOctave -
        this.params.marginPixels
    );
  }

  /** Gets the note corresponding to the provided x coordinate in pixels. */
  getNote(x: number): Note {
    if (this.width === 0) {
      return this.params.range.min;
    }

    // TODO: We could maybe do something fancier.
    const byteValue =
      this.params.range.min.byteValue +
      (this.params.range.max.byteValue + 1 - this.params.range.min.byteValue) *
        (x / this.width);
    return new Note(
      Math.min(this.params.range.max.byteValue, Math.floor(byteValue))
    );
  }

  protected override refresh(): void {
    this.context.clearRect(0, 0, this.width, this.height);
    this.context.fillStyle = this.params.color;
    const keyCoords = this.params.equalizeKeyWidths
      ? KEY_COORDS_EQUALIZED_BOTTOM
      : KEY_COORDS_BOTTOM;

    const note: MutableNote = new Note(this.params.range.min.byteValue);
    const maxNote = this.params.range.max.isWhite
      ? this.params.range.max
      : this.params.range.max.transpose(1);
    let lastPressed = false;
    for (; note.byteValue <= maxNote.byteValue; note.byteValue++) {
      if (note.isWhite !== this.renderWhite) {
        continue;
      }

      const currentPressed = this.state.isPressed(note);
      if (currentPressed !== lastPressed) {
        this.context.fillStyle = currentPressed
          ? this.params.pressedColor
          : this.params.color;
        lastPressed = currentPressed;
      }
      const keyStart = this.getLeftNoteEdge(note, keyCoords);
      const keyEnd = this.getRightNoteEdge(note, keyCoords);
      this.context.fillRect(keyStart, 0, keyEnd - keyStart, this.height);
    }
  }
}

const DEFAULT_RANGE = {min: Note.fromString('A0'), max: Note.fromString('C8')};

export class PianoRenderer {
  private blackKeyHeightRatio = 0.55;
  private readonly state = new PianoState();
  private readonly blackKeys = new KeysRenderer(
    {
      color: 'black',
      pressedColor: 'firebrick',
      width: 1,
      height: 1,
      range: DEFAULT_RANGE,
      marginPixels: 0,
      equalizeKeyWidths: false,
    },
    this.state,
    /*renderWhite=*/ false
  );
  private readonly whiteKeys = new KeysRenderer(
    {
      color: 'white',
      pressedColor: 'salmon',
      width: 1,
      height: 1,
      range: DEFAULT_RANGE,
      marginPixels: 1,
      equalizeKeyWidths: false,
    },
    this.state,
    /*renderWhite=*/ true
  );

  send(data: Iterable<number>) {
    this.state.send(data);
  }

  /** Gets the [minimum, maximum] note rendered in the piano. */
  getRange(): [Note, Note] {
    return [this.blackKeys.params.range.min, this.blackKeys.params.range.max];
  }

  setRange({
    min = this.blackKeys.params.range.min,
    max = this.blackKeys.params.range.max,
  }: Partial<Bounds<Note>>) {
    if (!(min.byteValue <= max.byteValue)) {
      throw new Error(
        `Minimum note must be lower than maximum, got range [${min}, ${max}]`
      );
    }
    this.blackKeys.setParam('range', {min, max});
  }

  /** Gets the [width, height] of the piano. */
  getSize(): [number, number] {
    return [this.whiteKeys.width, this.whiteKeys.height];
  }

  setSize({
    width = this.whiteKeys.width,
    height = this.whiteKeys.height,
  }: Partial<Dimensions>) {
    this.whiteKeys.setParam('width', width);
    this.whiteKeys.setParam('height', height);
    this.blackKeys.setParam('width', width);
    this.blackKeys.setParam(
      'height',
      Math.ceil(height * this.blackKeyHeightRatio)
    );
  }

  /**
   * Sets whether key widths should be equalized, making black and white keys
   * take up equal space. Suitable for overlaying the piano over a logarithmic
   * frequency axis.
   */
  setEqualizeKeyWidths(equalize: boolean) {
    this.blackKeys.setParam('equalizeKeyWidths', equalize);
    this.whiteKeys.setParam('equalizeKeyWidths', equalize);
  }

  getEqualizeKeyWidths(): boolean {
    return this.whiteKeys.params.equalizeKeyWidths;
  }

  /** Returns the note coordinates in pixels along the X axis. */
  getNoteCoords(note: Note): [number, number] {
    return [
      this.whiteKeys.getLeftNoteEdge(note),
      this.whiteKeys.getRightNoteEdge(note),
    ];
  }

  /** Gets the note corresponding to the provided x coordinate in pixels. */
  getNote(x: number): Note {
    return this.whiteKeys.getNote(x);
  }

  drawPianoTo(context: CanvasRenderingContext2D, x: number, y: number) {
    this.whiteKeys.drawTo(context, x, y);
    this.blackKeys.drawTo(context, x, y);
  }

  drawPedalsTo(context: CanvasRenderingContext2D, x: number, y: number) {
    // TODO: This is not very pretty.
    context.save();
    context.fillStyle = 'salmon';
    context.font = '18px sans-serif';
    const padding = 8;

    let offset = 0;
    for (const pedal of this.state.getSwitches()) {
      const name = PEDAL_NAMES.get(pedal);
      if (name) {
        context.fillText(name, x + padding + offset, y - padding);
        offset += context.measureText(name).width + padding;
      }
    }
    context.restore();
  }
}
