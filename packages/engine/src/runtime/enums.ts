import type { EnumDeclaration } from '../compiler/ast.ts';

/** Member identity is independent of its display title and stable for an entire run. */
export class PineEnumValue {
  readonly type: string;
  readonly member: string;
  readonly title: string;

  constructor(type: string, member: string, title: string) {
    this.type = type;
    this.member = member;
    this.title = title;
    Object.freeze(this);
  }

  toString(): string {
    return this.title;
  }
}

export class EnumRegistry {
  private declarations = new Map<number, Readonly<Record<string, PineEnumValue>>>();

  declare(node: EnumDeclaration): Readonly<Record<string, PineEnumValue>> {
    let members = this.declarations.get(node.id);
    if (!members) {
      members = Object.freeze(
        Object.fromEntries(
          node.fields.map((field) => [
            field.name,
            new PineEnumValue(node.name, field.name, field.title ?? field.name),
          ]),
        ),
      );
      this.declarations.set(node.id, members);
    }
    return members;
  }

  input(defval: unknown, override: unknown, options?: unknown): PineEnumValue {
    if (!(defval instanceof PineEnumValue)) throw new Error('input.enum requires an enum default');
    const members = [...this.declarations.values()]
      .flatMap(Object.values)
      .filter((member) => member.type === defval.type);
    const choices = options === undefined ? members : options;
    if (
      !Array.isArray(choices) ||
      !choices.length ||
      choices.some((choice) => !members.includes(choice)) ||
      !choices.includes(defval)
    )
      throw new Error('input.enum options must contain its default and members of the same enum');
    if (override === undefined) return defval;
    if (typeof override !== 'string')
      throw new Error(
        'input.enum override must be a member name, qualified name, or display title',
      );
    // Never choose an arbitrary member when a title collides with another name or title.
    const matches = choices.filter(
      (choice) =>
        override === choice.member ||
        override === `${choice.type}.${choice.member}` ||
        override === choice.title,
    );
    if (matches.length !== 1)
      throw new Error(`Invalid or ambiguous input.enum override ${JSON.stringify(override)}`);
    return matches[0];
  }
}
