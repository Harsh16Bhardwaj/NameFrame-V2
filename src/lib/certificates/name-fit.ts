export const MIN_CERTIFICATE_FONT_SIZE = 8;

export type NormalizedNameBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type FittedName = {
  fontSize: number;
  box: { left: number; top: number; right: number; bottom: number; width: number; height: number };
};

export class NameFitError extends Error {
  constructor(
    readonly code: "INVALID_TEMPLATE_COORDINATES" | "INVALID_TEMPLATE_CONFIGURATION" | "CERTIFICATE_NAME_DOES_NOT_FIT",
    message: string,
  ) {
    super(message);
    this.name = "NameFitError";
  }
}

export function fitParticipantName(input: {
  name: string;
  sourceWidth: number;
  sourceHeight: number;
  bounds: NormalizedNameBounds;
  configuredFontSize: number;
  minimumFontSize?: number;
}): FittedName {
  const { name, sourceWidth, sourceHeight, bounds, configuredFontSize } = input;
  const minimumFontSize = input.minimumFontSize ?? MIN_CERTIFICATE_FONT_SIZE;

  if (
    !Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0 ||
    !Object.values(bounds).every(Number.isFinite) || bounds.left < 0 || bounds.top < 0 ||
    bounds.right > 1 || bounds.bottom > 1 || bounds.left >= bounds.right || bounds.top >= bounds.bottom
  ) {
    throw new NameFitError("INVALID_TEMPLATE_COORDINATES", "The certificate name bounds are invalid.");
  }
  if (
    !name.trim() || !Number.isInteger(configuredFontSize) || !Number.isInteger(minimumFontSize) ||
    configuredFontSize < minimumFontSize || minimumFontSize < 1
  ) {
    throw new NameFitError("INVALID_TEMPLATE_CONFIGURATION", "The certificate name style is invalid.");
  }

  const left = Math.round(bounds.left * sourceWidth);
  const top = Math.round(bounds.top * sourceHeight);
  const right = Math.round(bounds.right * sourceWidth);
  const bottom = Math.round(bounds.bottom * sourceHeight);
  const box = { left, top, right, bottom, width: right - left, height: bottom - top };

  for (let fontSize = configuredFontSize; fontSize >= minimumFontSize; fontSize -= 1) {
    if (estimatedTextWidth(name.trim(), fontSize) <= box.width && fontSize * 1.2 <= box.height) {
      return { fontSize, box };
    }
  }

  throw new NameFitError("CERTIFICATE_NAME_DOES_NOT_FIT", "The participant name does not fit inside the configured bounds.");
}

export function estimatedTextWidth(text: string, fontSize: number): number {
  let units = 0;
  for (const character of text) {
    if (/\s/u.test(character)) units += 0.32;
    else if (/[ilI1.,'`|!]/u.test(character)) units += 0.3;
    else if (/[MWmw@#%&]/u.test(character)) units += 0.9;
    else if (/[A-Z0-9]/u.test(character)) units += 0.66;
    else units += 0.56;
  }
  return units * fontSize * 1.05;
}
