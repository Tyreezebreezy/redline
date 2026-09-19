import type { WordToolsResult } from "./lexicon";
import { posLabel } from "./lexicon";

export type WordToolsState =
  | { status: "idle" }
  | { status: "loading"; word: string }
  | { status: "not-found"; word: string }
  | {
      status: "ready";
      word: string;
      from: number;
      to: number;
      result: WordToolsResult;
    };

function WordChip({
  onReplace,
  word,
}: {
  onReplace: (word: string) => void;
  word: string;
}) {
  return (
    <button
      className="wordtools-chip"
      onClick={() => onReplace(word)}
      type="button"
    >
      {word}
    </button>
  );
}

export function WordToolsPanel({
  onClose,
  onReplace,
  state,
}: {
  onClose: () => void;
  onReplace: (word: string) => void;
  state: WordToolsState;
}) {
  if (state.status === "idle") return null;

  return (
    <aside className="panel" aria-label="Word Tools">
      <header className="panel-header">
        <h2>Word Tools</h2>
        <button
          aria-label="Close Word Tools"
          className="icon-button"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </header>
      <div className="wordtools-content">
        {state.status === "loading" ? (
          <p className="wordtools-note">Looking up “{state.word}”…</p>
        ) : state.status === "not-found" ? (
          <p className="wordtools-note">
            No lexical entry found for “{state.word}”.
          </p>
        ) : (
          <div className="wordtools-result">
            <p className="wordtools-headword">{state.word}</p>
            {state.result.senses.map((sense, index) => (
              <section className="wordtools-sense" key={`${sense.pos}-${index}`}>
                <p className="wordtools-pos">{posLabel(sense.pos)}</p>
                {sense.definition[0] ? (
                  <p className="wordtools-definition">
                    {sense.definition[0]}
                  </p>
                ) : null}
                {sense.synonyms.length ? (
                  <div className="wordtools-group">
                    <span className="wordtools-label">Synonyms</span>
                    <div className="wordtools-chips">
                      {sense.synonyms.slice(0, 10).map((word) => (
                        <WordChip
                          key={word}
                          onReplace={onReplace}
                          word={word}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
                {sense.antonyms.length ? (
                  <div className="wordtools-group">
                    <span className="wordtools-label">Antonyms</span>
                    <div className="wordtools-chips">
                      {sense.antonyms.slice(0, 6).map((word) => (
                        <WordChip
                          key={word}
                          onReplace={onReplace}
                          word={word}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
                {sense.related.length ? (
                  <div className="wordtools-group">
                    <span className="wordtools-label">Related</span>
                    <div className="wordtools-chips">
                      {sense.related.slice(0, 6).map((word) => (
                        <WordChip
                          key={word}
                          onReplace={onReplace}
                          word={word}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
