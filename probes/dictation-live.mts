import assert from "node:assert/strict";

type Segment = { id: number; text: string };

class LiveTranscript {
  #nextId = 1;
  #documentId = "";
  #state: "idle" | "active" | "paused" | "failed" = "idle";
  partial = "";
  committed: Segment[] = [];

  start(documentId: string) {
    this.#documentId = documentId;
    this.#state = "active";
    this.partial = "";
  }

  partialResult(documentId: string, text: string) {
    if (this.#state === "active" && documentId === this.#documentId) {
      this.partial = text;
    }
  }

  commit(documentId: string, text: string) {
    const value = text.trim();
    if (
      this.#state !== "active" ||
      documentId !== this.#documentId ||
      !value ||
      this.committed.at(-1)?.text === value
    ) {
      return;
    }
    this.committed.push({ id: this.#nextId++, text: value });
    this.partial = "";
  }

  edit(id: number, text: string) {
    const segment = this.committed.find((candidate) => candidate.id === id);
    if (segment) segment.text = text;
  }

  pause() {
    if (this.#state === "active") this.#state = "paused";
  }

  resume() {
    if (this.#state === "paused") this.#state = "active";
  }

  cancelPartial() {
    this.partial = "";
  }

  closeDocument() {
    this.#state = "idle";
    this.#documentId = "";
    this.partial = "";
  }

  microphoneLost() {
    this.#state = "failed";
    this.partial = "";
  }
}

const transcript = new LiveTranscript();
transcript.start("document-a");
transcript.partialResult("document-a", "first par");
assert.equal(transcript.partial, "first par");
transcript.commit("document-a", "first phrase");
assert.deepEqual(transcript.committed, [{ id: 1, text: "first phrase" }]);

transcript.edit(1, "user corrected phrase");
transcript.partialResult("document-a", "second par");
transcript.commit("document-a", "second phrase");
assert.deepEqual(transcript.committed, [
  { id: 1, text: "user corrected phrase" },
  { id: 2, text: "second phrase" },
]);
transcript.commit("document-a", "second phrase");
assert.equal(transcript.committed.length, 2);

transcript.pause();
transcript.partialResult("document-a", "ignored while paused");
assert.equal(transcript.partial, "");
transcript.resume();
transcript.partialResult("document-a", "cancel me");
transcript.cancelPartial();
assert.equal(transcript.partial, "");

transcript.partialResult("document-b", "wrong document");
transcript.commit("document-b", "wrong document");
assert.equal(transcript.committed.length, 2);
transcript.microphoneLost();
assert.equal(transcript.partial, "");
transcript.closeDocument();

console.log(
  "PASS: partial/final transitions, duplicate prevention, user-edit ownership, pause/resume, cancel, microphone loss, and document isolation",
);
