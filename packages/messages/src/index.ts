/**
 * Display text as plain data: a string, or a message id with values for a UI to translate.
 * Every shape survives structuredClone and JSON, so text and errors can cross Worker and HTTP
 * boundaries without fixing a language on the sending side.
 */
export interface Message<Id extends string = string> {
  readonly kind: 'message';
  readonly id: Id;
  readonly values: MessageValues;
}
export interface MessageGroup {
  readonly kind: 'message-group';
  readonly parts: readonly Text[];
  readonly separator: Text;
}
export type Text = string | Message | MessageGroup;
export type MessageValues = Readonly<Record<string, Text | number>>;

export function message<Id extends string>(id: Id, values: MessageValues = {}): Message<Id> {
  return { kind: 'message', id, values };
}

/** A shallow shape check, as used to pick an error's text. */
export function isMessage(value: unknown): value is Message | MessageGroup {
  return (
    !!value &&
    typeof value === 'object' &&
    'kind' in value &&
    (value.kind === 'message' || value.kind === 'message-group')
  );
}

/** A full structural check for text received from another thread or process. */
export function isText(value: unknown, depth = 0): value is Text {
  if (typeof value === 'string') return true;
  if (depth > 16 || !isMessage(value)) return false;
  if (value.kind === 'message-group')
    return (
      Array.isArray(value.parts) &&
      value.parts.every((part) => isText(part, depth + 1)) &&
      isText(value.separator, depth + 1)
    );
  const values: unknown = value.values;
  return (
    typeof value.id === 'string' &&
    !!values &&
    typeof values === 'object' &&
    !Array.isArray(values) &&
    Object.values(values).every(
      (item) => (typeof item === 'number' && Number.isFinite(item)) || isText(item, depth + 1),
    )
  );
}

/** Untranslated fallback for `Error.message` and logs, e.g. `searchMin: title=Length, min=1`. */
export function plainText(text: Text): string {
  if (typeof text === 'string') return text;
  if (text.kind === 'message-group')
    return text.parts.map(plainText).join(plainText(text.separator));
  const values = Object.entries(text.values).map(
    ([key, value]) => `${key}=${typeof value === 'number' ? value : plainText(value)}`,
  );
  return values.length ? `${text.id}: ${values.join(', ')}` : text.id;
}

/** An error whose text is data a UI translates; `message` is only the untranslated fallback. */
export class TextError extends Error {
  readonly uiText: Text;
  constructor(text: Text) {
    super(plainText(text));
    this.uiText = text;
  }
}

/** The identity of an error a package raises on purpose: a stable code and its values. */
export interface Coded<Id extends string = string> {
  readonly code: Id;
  readonly values: MessageValues;
  readonly uiText: Message<Id>;
}

/** Base class for named coded errors such as a search-space or CSV error. */
export class CodedError<Id extends string = string> extends TextError implements Coded<Id> {
  declare readonly uiText: Message<Id>;
  readonly code: Id;
  readonly values: MessageValues;
  constructor(code: Id, values: MessageValues = {}) {
    super(message(code, values));
    this.code = code;
    this.values = values;
  }
}

/** A coded error of any Error subclass, for callers that distinguish RangeError or TypeError. */
export function codedError<Id extends string>(
  code: Id,
  values: MessageValues = {},
  ErrorType: new (message: string) => Error = Error,
): Error & Coded<Id> {
  const uiText = message(code, values);
  return Object.assign(new ErrorType(plainText(uiText)), { code, values, uiText });
}

/** True for a coded error, optionally one whose code is in `ids` or equals `code`. */
export function isCodedError<Id extends string>(
  error: unknown,
  ids?: readonly Id[],
  code?: Id,
): error is Error & Coded<Id> {
  if (!(error instanceof Error)) return false;
  const actual = (error as Partial<Coded>).code;
  return (
    typeof actual === 'string' &&
    isText((error as Partial<Coded>).uiText) &&
    (ids === undefined || (ids as readonly string[]).includes(actual)) &&
    (code === undefined || actual === code)
  );
}

/** The text an error carries: its `uiText` when it has one, otherwise its message. */
export function errorText(error: unknown): Text {
  if (error instanceof Error) {
    const uiText = (error as { uiText?: unknown }).uiText;
    if (typeof uiText === 'string' || isMessage(uiText)) return uiText;
    return error.message;
  }
  return isMessage(error) ? error : String(error);
}

export interface SerializedError {
  name: string;
  message: string;
  uiText?: Text;
}

/** Plain data for postMessage or JSON; the receiver restores it with `restoreError`. */
export function serializeError(error: unknown): SerializedError {
  const text = errorText(error);
  return {
    name: error instanceof Error ? error.name : 'Error',
    message: plainText(text),
    ...(typeof text === 'string' ? {} : { uiText: text }),
  };
}

/** Rebuild a received error; text that is not well-formed falls back to the plain message. */
export function restoreError(error: SerializedError): TextError {
  const restored = new TextError(isText(error.uiText) ? error.uiText : String(error.message));
  restored.name = typeof error.name === 'string' ? error.name : 'Error';
  return restored;
}
