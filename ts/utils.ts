'use strict';

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

/**
 * Finds and validates the specified elements.
 *
 * Given an object mapping IDs to HTML element types, the specified elements are
 * located, checked to ensure they are of the correct type, and returned. IDs
 * that could not be found are omitted from the returned object.
 */
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

/**
 * Floors the provided number to the nearest integer after first adding a small
 * `epsilon` to compensate for floating-point rounding errors. This ensures
 * values like 2.9999999998 are rounded to 3 instead of 2.
 */
export function floorInexact(x: number, epsilon = 1e-6): number {
  return Math.floor(x + epsilon);
}
