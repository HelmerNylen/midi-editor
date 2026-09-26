'use strict';

import {TypedEventTarget} from './event.js';
import {
  frequencyToNoteByteValue,
  Note,
  noteByteValueToFrequency,
} from './note.js';
import {
  Bounds,
  DEFAULT_RANGE,
  Dimensions,
  NotePositioner,
} from './rendering.js';
import {ceilInexact, floorInexact} from './utils.js';

interface TimingConverter {
  secondsToTicks(seconds: number): number;
  ticksToSeconds(ticks: number): number;
}

export interface CanvasViewportParams {
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** If true, larger time values are rendered towards the top of the canvas. */
  reverseY: boolean;
}

// TODO: Converting frequency to/from pixel coordinates.
export class Viewport extends TypedEventTarget<{
  change: void;
}> {
  // Bounds on the frequency axis.
  // TODO: Maybe let these be implicit, defined by notePositioner.
  private noteMinInternal: Note;
  private noteMaxInternal: Note;
  // Cached computed frequency bounds for the frequency axis.
  private frequencyMinInternal: number | undefined;
  private frequencyMaxInternal: number | undefined;

  // Bounds on the time axis.
  private secondsMinInternal = 0;
  private secondsMaxInternal = 8;
  // Cached computed ticks bounds for the time axis.
  private ticksMinInternal: number | undefined;
  private ticksMaxInternal: number | undefined;

  // Cached computed coordinate transform parameters.
  private secondsToPixelsMultiplierInternal: number | undefined;

  readonly notePositioner: NotePositioner;
  private readonly canvasParams: CanvasViewportParams;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private timingConverter: TimingConverter,
    canvasParams: Partial<CanvasViewportParams> = {},
    range: Bounds<Note> = DEFAULT_RANGE,
    equalizeKeyWidths = false
  ) {
    super();
    this.canvasParams = {
      left: canvasParams.left ?? 0,
      right: canvasParams.right ?? 0,
      top: canvasParams.top ?? 0,
      bottom: canvasParams.bottom ?? 0,
      reverseY: canvasParams.reverseY ?? false,
    };
    this.noteMinInternal = range.min;
    this.noteMaxInternal = range.max;
    this.notePositioner = new NotePositioner({
      width: this.width,
      range,
      equalizeKeyWidths,
    });
  }

  setTimingConverter(timingConverter: TimingConverter) {
    this.timingConverter = timingConverter;
    this.ticksMinInternal = undefined;
    this.ticksMaxInternal = undefined;
    this.dispatchEvent('change');
  }

  setNoteBounds(min: Note, max: Note) {
    if (min.byteValue > max.byteValue) {
      throw new Error(
        `Minimum note cannot be higher than maximum note, got: ${min} > ${max}`
      );
    }
    this.notePositioner.setParam('range', {min, max});
    this.noteMinInternal = min;
    this.noteMaxInternal = max;
    this.frequencyMinInternal = undefined;
    this.frequencyMaxInternal = undefined;
    this.dispatchEvent('change');
  }

  setFrequencyBounds(min: number, max: number) {
    if (!(min < max)) {
      throw new Error(
        `Minimum frequency must be smaller than maximum frequency, got: min ` +
          `${min}, max ${max}`
      );
    }
    const minNoteValue = floorInexact(
      frequencyToNoteByteValue(this.frequencyMinInternal!) + 0.5
    );
    const maxNoteValue = ceilInexact(
      frequencyToNoteByteValue(this.frequencyMaxInternal!) - 0.5
    );
    this.setNoteBounds(clampToNote(minNoteValue), clampToNote(maxNoteValue));
  }

  setSecondsBounds(min: number, max: number) {
    if (!(min < max)) {
      throw new Error(
        `Minimum seconds must be smaller than maximum seconds, got: min ` +
          `${min}, max ${max}`
      );
    }
    this.secondsMinInternal = min;
    this.secondsMaxInternal = max;
    this.secondsToPixelsMultiplierInternal = undefined;
    this.ticksMinInternal = undefined;
    this.ticksMaxInternal = undefined;
    this.dispatchEvent('change');
  }

  setTicksBounds(min: number, max: number) {
    if (!(min < max)) {
      throw new Error(
        `Minimum ticks must be smaller than maximum ticks, got: min ` +
          `${min}, max ${max}`
      );
    }
    this.setSecondsBounds(
      this.timingConverter.ticksToSeconds(min),
      this.timingConverter.ticksToSeconds(max)
    );
  }

  setMinSeconds(min: number) {
    if (min === this.secondsMinInternal) {
      return;
    }
    const duration = this.secondsMaxInternal - this.secondsMinInternal;
    this.secondsMinInternal = min;
    this.secondsMaxInternal = min + duration;
    // secondsToPixelsMultiplierInternal does not need to be recomputed.
    this.ticksMinInternal = undefined;
    this.ticksMaxInternal = undefined;
    this.dispatchEvent('change');
  }

  resizeCanvas({
    width = this.canvas.width,
    height = this.canvas.height,
  }: Partial<Dimensions>) {
    let didChange = false;
    if (width !== this.canvas.width) {
      // Retain bounds, but notify note positioner that it needs to rescale.
      this.canvas.width = width;
      this.notePositioner.setParam('width', this.width);
      didChange = true;
    }
    if (height !== this.canvas.height) {
      // Retain scaling and lower bound on seconds, adjust upper bound.
      this.canvas.height = height;
      this.secondsMaxInternal =
        this.secondsMinInternal +
        this.height / Math.abs(this.secondsToPixelsMultiplier);
      this.ticksMaxInternal = undefined;
      didChange = true;
    }
    if (didChange) {
      this.dispatchEvent('change');
    }
  }

  setCanvasParams({
    left = this.canvasParams.left,
    right = this.canvasParams.right,
    top = this.canvasParams.left,
    bottom = this.canvasParams.right,
    reverseY = this.canvasParams.reverseY,
  }: Partial<CanvasViewportParams>) {
    let didChange = reverseY !== this.canvasParams.reverseY;
    this.canvasParams.reverseY = reverseY;

    if (left !== this.canvasParams.left || right !== this.canvasParams.right) {
      this.canvasParams.left = left;
      this.canvasParams.right = right;
      this.notePositioner.setParam('width', this.width);
      didChange = true;
    }

    if (top !== this.canvasParams.top || bottom !== this.canvasParams.bottom) {
      this.canvasParams.top = top;
      this.canvasParams.bottom = bottom;
      this.secondsMaxInternal =
        this.secondsMinInternal +
        this.height / Math.abs(this.secondsToPixelsMultiplier);
      this.ticksMaxInternal = undefined;
      didChange = true;
    }

    if (didChange) {
      this.dispatchEvent('change');
    }
  }

  setEqualizeKeyWidths(equalize: boolean) {
    this.notePositioner.setParam('equalizeKeyWidths', equalize);
    this.dispatchEvent('change');
  }

  get noteMin(): Note {
    return this.noteMinInternal;
  }
  get noteMax(): Note {
    return this.noteMaxInternal;
  }
  get frequencyMin(): number {
    this.frequencyMinInternal ??= noteByteValueToFrequency(
      this.noteMinInternal.byteValue - 0.5
    );
    return this.frequencyMinInternal;
  }
  get frequencyMax(): number {
    this.frequencyMaxInternal ??= noteByteValueToFrequency(
      this.noteMaxInternal.byteValue + 0.5
    );
    return this.frequencyMaxInternal;
  }
  get secondsMin(): number {
    return this.secondsMinInternal;
  }
  get secondsMax(): number {
    return this.secondsMaxInternal;
  }
  get ticksMin(): number {
    this.ticksMinInternal ??= floorInexact(
      this.timingConverter.secondsToTicks(this.secondsMinInternal)
    );
    return this.ticksMinInternal;
  }
  get ticksMax(): number {
    this.ticksMaxInternal ??= ceilInexact(
      this.timingConverter.secondsToTicks(this.secondsMaxInternal)
    );
    return this.ticksMaxInternal;
  }
  get width(): number {
    return Math.max(
      0,
      this.canvas.width - this.canvasParams.right - this.canvasParams.left
    );
  }
  get height(): number {
    return Math.max(
      0,
      this.canvas.height - this.canvasParams.top - this.canvasParams.bottom
    );
  }

  private get secondsToPixelsMultiplier(): number {
    this.secondsToPixelsMultiplierInternal ??=
      ((this.canvasParams.reverseY ? -1 : 1) * this.height) /
      (this.secondsMaxInternal - this.secondsMinInternal);
    return this.secondsToPixelsMultiplierInternal;
  }

  secondsToPixels(seconds: number): number {
    const t = seconds - this.secondsMinInternal;
    const offset = this.canvasParams.reverseY
      ? this.canvas.height - this.canvasParams.bottom
      : this.canvasParams.top;
    return offset + t * this.secondsToPixelsMultiplier;
  }

  pixelsToSeconds(pixels: number): number {
    const offset = this.canvasParams.reverseY
      ? this.canvas.height - this.canvasParams.bottom
      : this.canvasParams.top;
    return (
      this.secondsMinInternal +
      (pixels - offset) / this.secondsToPixelsMultiplier
    );
  }

  ticksToPixels(ticks: number): number {
    return this.secondsToPixels(this.timingConverter.ticksToSeconds(ticks));
  }

  pixelsToTicks(pixels: number): number {
    return this.timingConverter.secondsToTicks(this.pixelsToSeconds(pixels));
  }

  noteLeftEdgeToPixels(note: Note): number {
    return this.notePositioner.getLeftNoteEdge(note);
  }

  noteRightEdgeToPixels(note: Note): number {
    return this.notePositioner.getRightNoteEdge(note);
  }

  pixelsToNote(pixels: number): Note {
    return this.notePositioner.getNote(pixels);
  }
}

function clampToNote(value: number): Note {
  return new Note(Math.max(0, Math.min(0x7f, value)));
}
