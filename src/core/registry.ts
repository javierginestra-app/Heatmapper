/** Holds providers registered by the app layer; features look them up by id. */
export class Registry<T extends { readonly id: string }> {
  private readonly items = new Map<string, T>();

  register(item: T): this {
    if (this.items.has(item.id)) throw new Error(`Provider "${item.id}" is already registered`);
    this.items.set(item.id, item);
    return this;
  }

  get(id: string): T | undefined {
    return this.items.get(id);
  }

  list(): readonly T[] {
    return [...this.items.values()];
  }
}
