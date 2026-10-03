export interface Binding {
  value: any;
  history: any[];
  type?: string;
  persistent?: boolean;
}
export class Scope {
  parent?: Scope;
  functionHistory?: Scope;
  key: string;
  vars = new Map<string, Binding>();
  touched = new Set<Binding>();
  expressions = new Map<number, any[]>();
  currentExpressions = new Map<number, any>();
  constructor(key: string, parent?: Scope) {
    this.key = key;
    this.parent = parent;
  }
  find(name: string): Binding | undefined {
    return this.vars.get(name) ?? this.parent?.find(name);
  }
  set(name: string, value: any, type?: string): Binding {
    let binding = this.vars.get(name);
    if (!binding) {
      binding = { value, history: [], type };
      this.vars.set(name, binding);
    }
    binding.value = value;
    this.touched.add(binding);
    return binding;
  }
  commit(): void {
    for (const binding of this.touched) binding.history.push(binding.value);
    for (const [id, value] of this.currentExpressions) {
      if (!this.expressions.has(id)) this.expressions.set(id, []);
      this.expressions.get(id)!.push(value);
    }
    this.touched.clear();
    this.currentExpressions.clear();
  }

  checkpoint(): () => void {
    const bindings = new Map(
      [...this.vars].map(([name, binding]) => [
        name,
        { binding, value: binding.value, length: binding.history.length },
      ]),
    );
    const expressionLengths = new Map(
      [...this.expressions].map(([id, values]) => [id, values.length]),
    );
    return () => {
      for (const [name, binding] of this.vars) {
        const saved = bindings.get(name);
        if (!saved) {
          if (!binding.persistent) this.vars.delete(name);
          else binding.history.length = 0;
        } else {
          if (!binding.persistent) binding.value = saved.value;
          binding.history.length = saved.length;
        }
      }
      for (const [id, values] of this.expressions) {
        const length = expressionLengths.get(id);
        if (length === undefined) this.expressions.delete(id);
        else values.length = length;
      }
      this.touched.clear();
      this.currentExpressions.clear();
    };
  }

  discardTransient(): void {
    for (const [name, binding] of this.vars) {
      if (!binding.persistent) this.vars.delete(name);
      else binding.history.length = 0;
    }
    this.expressions.clear();
    this.currentExpressions.clear();
    this.touched.clear();
  }
}
