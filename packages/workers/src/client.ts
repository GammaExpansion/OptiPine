import type { ParameterSet, RunInput } from '@pine/engine';
import { errorText, isMessage } from '@pine/messages';
import type { TrialResult } from '@pine/optimizer';
import { EngineRunClient } from './engine-run-client.ts';
import { isPackedInput, snapshotInput, transferInput, type PackedRunInput } from './run-input.ts';

export { WorkerCancelledError, WorkerCrashedError, WorkerStaleError } from './engine-run-client.ts';

/** Adds reproduction to the run/describe client; packing loads only with optimization. */
export class EngineWorkerClient extends EngineRunClient {
  #prepared: { source: string; common: RunInput | PackedRunInput; revision: number } | null = null;

  /** Reuse an immutable common snapshot in this Worker; only parameter overrides travel again. */
  reproduce(
    source: string,
    common: RunInput | PackedRunInput,
    parameters: ParameterSet,
    sourceRevision = this.sourceRevision,
  ): Promise<TrialResult> {
    this.setSourceRevision(sourceRevision);
    const previous = this.#prepared;
    const same =
      previous?.source === source &&
      previous.common === common &&
      previous.revision === sourceRevision;
    const prepared = { source, common, revision: sourceRevision };
    let input: PackedRunInput | undefined;
    try {
      input = same
        ? undefined
        : transferInput(isPackedInput(common) ? common : snapshotInput(common));
    } catch (error) {
      return Promise.reject(error);
    }
    this.#prepared = prepared;
    return this.request<TrialResult>(
      { kind: 'reproduce', source, common: input, parameters },
      sourceRevision,
      input ? [input.bars.buffer] : [],
    ).catch((error) => {
      if (this.#prepared === prepared) this.#prepared = null;
      const text = errorText(error);
      // A custom dispatcher may have lost its snapshot. Replay it once, as on a fresh Worker.
      if (same && isMessage(text) && 'id' in text && text.id === 'invalidOptimizationDispatch')
        return this.reproduce(source, common, parameters, sourceRevision);
      throw error;
    });
  }

  protected override onWorkerStopped(): void {
    this.#prepared = null;
  }
}
