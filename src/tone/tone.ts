export type ToneDescriptor = {
  label: string;
  confidence: "low" | "moderate" | "high";
};

export function analyzeTone(text: string): ToneDescriptor[] {
  const descriptors: ToneDescriptor[] = [];
  const lower = text.toLocaleLowerCase("en-US");

  if (
    /\b(?:don't|can't|won't|isn't|it's|i'm|you're|we're|they're|that's|gonna|wanna|ain't)\b/u.test(
      lower,
    )
  ) {
    descriptors.push({ label: "Informal", confidence: "high" });
  }

  const hedges =
    lower.match(
      /\b(?:maybe|perhaps|possibly|might|sort of|kind of|i think|i guess|probably|somewhat)\b/gu,
    )?.length ?? 0;
  if (hedges >= 2) {
    descriptors.push({ label: "Tentative", confidence: "moderate" });
  }

  const strong =
    lower.match(
      /\b(?:definitely|certainly|always|never|must|clearly|obviously|undoubtedly)\b/gu,
    )?.length ?? 0;
  if (strong >= 2) {
    descriptors.push({ label: "Confident", confidence: "moderate" });
  }

  const formal =
    lower.match(
      /\b(?:therefore|however|moreover|furthermore|thus|consequently|nevertheless|accordingly)\b/gu,
    )?.length ?? 0;
  if (formal >= 1) {
    descriptors.push({ label: "Formal", confidence: "moderate" });
  }

  if (/\b(?:you|please)\b/u.test(lower)) {
    descriptors.push({ label: "Direct", confidence: "low" });
  }

  if (!descriptors.length) {
    descriptors.push({ label: "Neutral", confidence: "low" });
  }

  return descriptors;
}
