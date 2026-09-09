'use strict';

export enum Tag {
  CHUNK_HEADER,
  DELTA_TIME,
  DATA_LENGTH,
  STRING,
  VARINT,
  FIXED_INT,
  STATUS,
  RUNNING_STATUS_USED,
  MIDI_EVENT_PAYLOAD,
  SYSEX_EVENT_PAYLOAD,
  META_EVENT_PAYLOAD,
  META_EVENT_TYPE,
}

const MAX_TAG_NUMBER = Object.values(Tag)
  .filter((v) => typeof v === 'number')
  .reduce((a, b) => Math.max(a, b));
if (MAX_TAG_NUMBER > 32) {
  throw new Error(`Not implemented`);
}
const ArrayType =
  MAX_TAG_NUMBER >= 16
    ? Uint32Array
    : MAX_TAG_NUMBER >= 8
      ? Uint16Array
      : Uint8Array;

export class ByteTagger {
  private readonly tagArray: Uint32Array | Uint16Array | Uint8Array;

  private pointer = 0;

  constructor(readonly length: number) {
    this.tagArray = new ArrayType(length);
  }

  tag(...tags: Tag[]) {
    let value = this.tagArray[this.pointer];
    for (const tag of tags) {
      value |= 1 << tag;
    }
    this.tagArray[this.pointer] = value;
  }

  increment() {
    this.pointer++;
  }

  tagAndIncrement(...tags: Tag[]) {
    this.tag(...tags);
    this.increment();
  }

  tagRange(length: number, ...tags: Tag[]) {
    for (let i = 0; i < length; i++) {
      this.tagAndIncrement(...tags);
    }
  }

  assertPointerAt(value: number) {
    if (this.pointer !== value) {
      throw new Error(`Byte tagger misaligned`);
    }
  }

  visualizeEnd(
    view: DataView,
    // TODO: Move message enums to its own file to remove the need for this.
    commentFunc: (tags: Set<Tag>, value: number) => string = () => '',
    lookBehind = 20,
    lookAhead = 10
  ) {
    const columnSeparator = '\t|\t';
    const lines = [
      '======== Byte tagger output ========',
      ['Offset', 'Hex', 'Dec', 'Tags', 'Comment'].join(columnSeparator),
    ];
    for (
      let offset = Math.max(this.pointer - lookBehind, 0);
      offset < Math.min(this.length, view.byteLength, this.pointer + lookAhead);
      offset++
    ) {
      const value = view.getUint8(offset);
      const hex = value.toString(16).padStart(2, '0');
      const tags = new Set<Tag>();
      const compressedTags = this.tagArray[offset];
      for (let tag = 0; tag <= MAX_TAG_NUMBER; tag++) {
        if ((1 << tag) & compressedTags) {
          tags.add(tag);
        }
      }

      lines.push(
        [
          String(offset).padStart(4),
          hex,
          String(value).padStart(3),
          Array.from(tags, (tag) => Tag[tag]).join('\t'),
          commentFunc(tags, value),
        ].join(columnSeparator)
      );
    }
    console.log(lines.join('\n'));
  }
}
