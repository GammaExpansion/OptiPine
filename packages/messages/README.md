# @pine/messages

Display text and errors as plain data, shared by `@pine/optimizer`, `@pine/market-data` and
`@pine/workers`. A package never fixes a language: it emits a message id with values, and the
application translates the id with its own catalog. Every shape survives `structuredClone` and
JSON, so text and errors cross Worker and HTTP boundaries unchanged.

## API

| Export                              | Purpose                                                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `Text`, `Message`, `MessageGroup`   | A string, `{ kind: 'message', id, values }`, or parts joined by a separator. Values may nest messages.    |
| `message(id, values)`               | Build a `Message`.                                                                                        |
| `plainText(text)`                   | Untranslated rendering such as `searchMin: title=Length, min=1`, used for `Error.message` and logs.       |
| `TextError`                         | An `Error` carrying `uiText: Text`.                                                                       |
| `CodedError`, `codedError`, `Coded` | Errors identified by a stable `code` and `values`; `codedError` keeps a `RangeError` or `TypeError` type. |
| `isCodedError(error, ids?, code?)`  | Recognise a coded error, optionally from one package's id list.                                           |
| `errorText(error)`                  | The text an error carries: its `uiText`, otherwise its message.                                           |
| `serializeError`, `restoreError`    | Send an error through `postMessage` or JSON and rebuild it, keeping its name and text.                    |
| `isText(value)`                     | Structural check applied to text received from another thread or process.                                 |

Each package exports the ids it can emit (`optimizerMessageIds`, `marketDataMessageIds`,
`workerMessageIds`). An application that translates them should test that its catalog covers
every id in those lists.
