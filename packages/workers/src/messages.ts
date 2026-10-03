import { codedError, message, type Coded, type Message, type MessageValues } from '@pine/messages';

/** Every message id this package emits. A UI that translates them should cover this list. */
export const workerMessageIds = [
  'analysisWorkerClosed',
  'analysisWorkerCrashed',
  'analysisWorkerResponseMismatch',
  'analysisWorkerUnreadable',
  'engineWorkerClosed',
  'engineWorkerCrashed',
  'engineWorkerResponseMismatch',
  'engineWorkerUnreadable',
  'invalidOptimizationDispatch',
  'invalidSourceRevision',
  'optimizerTrialIndexInvalid',
  'optimizerTrialsIncomplete',
  'optimizerWorkerResponseMismatch',
  'optimizerWorkerUnreadable',
  'optimizerWorkersClosed',
  'parameterNamespacesRequired',
  'parameterObjectsRequired',
  'runCancelled',
  'sourceChangedIgnored',
  'strategyCompileFailed',
] as const;
export type WorkerMessageId = (typeof workerMessageIds)[number];
export type WorkerMessage = Message<WorkerMessageId>;

export function workerMessage(id: WorkerMessageId, values: MessageValues = {}): WorkerMessage {
  return message(id, values);
}

export function workerError(
  code: WorkerMessageId,
  values: MessageValues = {},
  ErrorType: new (message: string) => Error = Error,
): Error & Coded<WorkerMessageId> {
  return codedError(code, values, ErrorType);
}
