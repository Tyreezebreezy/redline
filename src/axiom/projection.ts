import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { AxiomIssue } from "./axiom";

export type ProjectionSegment = {
  kind: "text" | "hard-break" | "separator";
  from: number;
  to: number;
  editorFrom: number;
  editorTo: number;
};

export type Projection = {
  text: string;
  segments: ProjectionSegment[];
};

export type EditorIssue = AxiomIssue & {
  editorFrom: number;
  editorTo: number;
};

export function projectDocument(doc: ProseMirrorNode): Projection {
  const blocks: { node: ProseMirrorNode; position: number }[] = [];
  doc.descendants((node, position) => {
    if (node.isTextblock) blocks.push({ node, position });
  });

  let text = "";
  const segments: ProjectionSegment[] = [];
  let previousEnd = 0;

  const append = (
    value: string,
    kind: ProjectionSegment["kind"],
    editorFrom: number,
    editorTo: number,
  ) => {
    const from = text.length;
    text += value;
    segments.push({ kind, from, to: text.length, editorFrom, editorTo });
  };

  blocks.forEach(({ node, position }, index) => {
    const contentStart = position + 1;
    if (index > 0) {
      append("\n", "separator", previousEnd, contentStart);
    }
    node.descendants((child, relativePosition) => {
      const editorFrom = contentStart + relativePosition;
      if (child.isText) {
        append(
          child.text ?? "",
          "text",
          editorFrom,
          editorFrom + child.nodeSize,
        );
      } else if (child.type.name === "hardBreak") {
        append("\n", "hard-break", editorFrom, editorFrom + child.nodeSize);
      }
    });
    previousEnd = contentStart + node.content.size;
  });

  return { text, segments };
}

function mapOffset(projection: Projection, offset: number) {
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > projection.text.length
  ) {
    return null;
  }
  if (projection.segments.length === 0) return offset === 0 ? 0 : null;

  for (const segment of projection.segments) {
    if (offset >= segment.from && offset <= segment.to) {
      if (offset === segment.from) return segment.editorFrom;
      if (offset === segment.to) return segment.editorTo;
      if (segment.kind !== "text") return null;
      return segment.editorFrom + offset - segment.from;
    }
  }
  return null;
}

export function mapIssue(
  projection: Projection,
  issue: AxiomIssue,
): EditorIssue | null {
  const touchesContent = projection.segments.some(
    (segment) =>
      segment.kind !== "separator" &&
      (issue.from === issue.to
        ? issue.from >= segment.from && issue.from <= segment.to
        : issue.from < segment.to && issue.to > segment.from),
  );
  if (!touchesContent) {
    return null;
  }
  const editorFrom = mapOffset(projection, issue.from);
  const editorTo = mapOffset(projection, issue.to);
  if (editorFrom === null || editorTo === null || editorTo < editorFrom) {
    return null;
  }
  return { ...issue, editorFrom, editorTo };
}
