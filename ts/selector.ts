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

  syncOptions(options?: readonly T[]) {
    this.options = options ?? this.options;
    const optionsById = new Map(
      Array.from(this.options, (option) => [this.idFunc(option), option])
    );

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
