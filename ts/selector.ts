'use strict';

import {TypedEventTarget} from './event.js';

export class Selector<T> extends TypedEventTarget<{select: T | null}> {
  constructor(
    private readonly selectElement: HTMLSelectElement,
    private options: readonly T[],
    initialSelection?: NoInfer<T>,
    private readonly labelFunc: (option: NoInfer<T>) => string = String,
    private readonly idFunc: (option: NoInfer<T>) => string = labelFunc
  ) {
    super();
    this.syncOptions();
    if (initialSelection) {
      this.selectElement.value = idFunc(initialSelection);
    }
    this.selectElement.addEventListener('change', () => {
      const value = this.selectElement.value;
      const option =
        this.options.find((option) => this.idFunc(option) === value) ?? null;
      this.dispatchEvent('select', option);
    });
  }

  select(option: T) {
    const id = this.idFunc(option);
    if (this.options.indexOf(option) === -1) {
      throw new Error(
        `Not an available option: ${option} (id: ${id}, label: ` +
          `${this.labelFunc(option)})`
      );
    }
    this.selectById(this.idFunc(option));
  }

  selectById(id: string): void {
    for (const child of this.selectElement.children) {
      if (child.getAttribute('value') === id) {
        this.selectElement.value = id;
        this.selectElement.dispatchEvent(new Event('change'));
        return;
      }
    }
    throw new Error(`Invalid option id: ${id}`);
  }

  syncOptions(options?: readonly T[]) {
    this.options = options ?? this.options;
    const optionsById = new Map(
      Array.from(this.options, (option) => [this.idFunc(option), option])
    );
    if (optionsById.size !== this.options.length) {
      console.warn(`Selector received multiple options with the same ID`);
    }

    // Remove or update stale existing elements.
    for (const child of Array.from(
      this.selectElement.children
    ) as HTMLOptionElement[]) {
      const childValue = child.getAttribute('value');
      const option = optionsById.get(childValue!);
      if (!option) {
        if (this.selectElement.value === childValue) {
          this.selectElement.value = '';
        }
        this.selectElement.removeChild(child);
        continue;
      }

      const label = this.labelFunc(option);
      if (child.innerText !== label) {
        child.innerText = label;
      }
    }

    // Add missing elements.
    const existingIds = Array.from(this.selectElement.children, (child) =>
      child.getAttribute('value')
    );
    for (const [id, option] of optionsById) {
      if (!existingIds.includes(id)) {
        const element = document.createElement('option');
        element.innerText = this.labelFunc(option);
        element.value = id;
        this.selectElement.add(element);
      }
    }
  }
}
