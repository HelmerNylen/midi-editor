type EventListener<Target, Data = unknown> = (
  data: Data,
  target: Target
) => void;

export class TypedEventTarget<EventMap extends object> {
  private readonly callbacksByType = new Map<
    keyof EventMap,
    Set<EventListener<this>>
  >();
  private readonly runOnlyOnce = new WeakSet<EventListener<this>>();

  addEventListener<Type extends keyof EventMap>(
    type: Type,
    listener: EventListener<this, EventMap[NoInfer<Type>]>,
    once = false
  ) {
    let callbacks = this.callbacksByType.get(type);
    if (!callbacks) {
      callbacks = new Set();
      this.callbacksByType.set(type, callbacks);
    }
    callbacks.add(listener as EventListener<this>);
    if (once) {
      this.runOnlyOnce.add(listener as EventListener<this>);
    }
  }

  removeEventListener<Type extends keyof EventMap>(
    type: Type,
    listener: EventListener<this, EventMap[NoInfer<Type>]>
  ) {
    this.callbacksByType.get(type)?.delete(listener as EventListener<this>);
  }

  dispatchEvent<Type extends keyof EventMap>(
    type: EventMap[NoInfer<Type>] extends void ? Type : never
  ): void;
  dispatchEvent<Type extends keyof EventMap>(
    type: Type,
    data: EventMap[NoInfer<Type>]
  ): void;
  dispatchEvent<Type extends keyof EventMap>(
    type: Type,
    data?: EventMap[NoInfer<Type>]
  ): void {
    const callbacks = this.callbacksByType.get(type);
    for (const callback of callbacks ? Array.from(callbacks) : []) {
      try {
        callback(data, this);
      } catch (e) {
        console.error(e);
      }
      if (this.runOnlyOnce.has(callback)) {
        callbacks!.delete(callback);
      }
    }
  }
}
