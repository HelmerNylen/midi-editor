/** Returns a promise that resolves after the given number of milliseconds. */
export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

type ElementsById = {[id: string]: HTMLElement};
type ElementTypesById<T extends ElementsById> = {
  [Id in keyof T]: new () => T[Id];
};

/**
 * Finds and validates the specified elements.
 * 
 * Given an object mapping IDs to HTML element types, the specified elements are
 * located, checked to ensure they are of the correct type, and returned.
 */
export function elementDeps<T extends ElementsById>(
  deps: ElementTypesById<T>
): T {
  const result = optionalElementDeps(deps);
  const missingIds = new Set(Object.keys(deps)).difference(
    new Set(Object.keys(result))
  );
  if (missingIds.size) {
    throw new Error(
      `No elements were found with the following ids: ${Array.from(missingIds)}`
    );
  }
  return result as T;
}

export function optionalElementDeps<T extends ElementsById>(
  deps: ElementTypesById<T>
): Partial<T> {
  const result: Partial<T> = {};
  for (const [id, type] of Object.entries(deps)) {
    const element = document.getElementById(id);
    if (!element) {
      continue;
    }
    if (!(element instanceof type)) {
      throw new Error(
        `Expected element with id ${id} to be an instance of ${type.name}, ` +
          `got: ${(element as object).constructor.name}`
      );
    }
    (result as ElementsById)[id] = element;
  }
  return result;
}
