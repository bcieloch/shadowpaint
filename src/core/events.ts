export type EventListener<T> = (payload: T) => void;

export class TypedEmitter<TEvents extends Record<string, unknown>> {
  private listeners = new Map<keyof TEvents, Set<EventListener<never>>>();

  on<K extends keyof TEvents>(event: K, listener: EventListener<TEvents[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as EventListener<never>);
    return () => {
      set?.delete(listener as EventListener<never>);
    };
  }

  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      (listener as EventListener<TEvents[K]>)(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
