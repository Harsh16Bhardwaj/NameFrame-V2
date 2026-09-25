import { v2 as cloudinary } from "cloudinary";

export type CertificateRenderInput = {
  eventId: string;
  participantId: string;
  backgroundUrl: string;
  participantName: string;
  sourceWidth: number;
  sourceHeight: number;
  fontSize: number;
  fontColor: string;
  fontWeight: string;
  textAlign: "left" | "center" | "right";
  box: { left: number; top: number; right: number; bottom: number };
};

export type CertificateRenderResult = {
  artifactUrl: string;
  publicId: string;
  width: number;
  height: number;
};

export type CertificateRenderer = (input: CertificateRenderInput) => Promise<CertificateRenderResult>;

export class CertificateRenderError extends Error {
  constructor(readonly code: string, readonly retryable: boolean, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CertificateRenderError";
  }
}

export function certificatePublicId(eventId: string, participantId: string): string {
  return `certificates/${eventId}/${participantId}`;
}

export const renderCertificateWithCloudinary: CertificateRenderer = async (input) => {
  configureCloudinary();
  const publicId = certificatePublicId(input.eventId, input.participantId);
  const centerY = Math.round((input.box.top + input.box.bottom) / 2 - input.sourceHeight / 2);
  const placement = input.textAlign === "left"
    ? { gravity: "west", x: Math.round(input.box.left), y: centerY }
    : input.textAlign === "right"
      ? { gravity: "east", x: Math.round(input.sourceWidth - input.box.right), y: centerY }
      : { gravity: "center", x: Math.round((input.box.left + input.box.right) / 2 - input.sourceWidth / 2), y: centerY };

  try {
    const result = await cloudinary.uploader.upload(input.backgroundUrl, {
      public_id: publicId,
      resource_type: "image",
      overwrite: true,
      invalidate: true,
      unique_filename: false,
      format: "png",
      transformation: [
        { width: input.sourceWidth, height: input.sourceHeight, crop: "fill" },
        {
          overlay: {
            font_family: "Arial",
            font_size: input.fontSize,
            font_weight: input.fontWeight,
            text: input.participantName,
          },
          color: input.fontColor,
          ...placement,
        },
      ],
    });
    return {
      artifactUrl: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
    };
  } catch (error) {
    throw classifyCloudinaryError(error);
  }
};

export function classifyCloudinaryError(error: unknown): CertificateRenderError {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const httpCode = numberValue(record.http_code) ?? numberValue(record.statusCode);
  const providerCode = typeof record.code === "string" ? record.code.toUpperCase() : "";

  if (httpCode === 429) return new CertificateRenderError("CLOUDINARY_RATE_LIMITED", true, "Certificate rendering was rate limited.", { cause: error });
  if (httpCode === 408 || (httpCode !== undefined && httpCode >= 500)) {
    return new CertificateRenderError("CLOUDINARY_UNAVAILABLE", true, "Certificate rendering is temporarily unavailable.", { cause: error });
  }
  if (["ETIMEDOUT", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN"].includes(providerCode)) {
    return new CertificateRenderError("CLOUDINARY_UNAVAILABLE", true, "Certificate rendering is temporarily unavailable.", { cause: error });
  }
  if (httpCode === 404) return new CertificateRenderError("CLOUDINARY_SOURCE_MISSING", false, "The certificate background could not be loaded.", { cause: error });
  if (httpCode !== undefined && httpCode >= 400 && httpCode < 500) {
    return new CertificateRenderError("CLOUDINARY_INVALID_TRANSFORMATION", false, "The certificate rendering configuration is invalid.", { cause: error });
  }
  return new CertificateRenderError("CERTIFICATE_GENERATION_FAILED", true, "Certificate rendering failed unexpectedly.", { cause: error });
}

function configureCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new CertificateRenderError("CLOUDINARY_UNAVAILABLE", true, "Certificate rendering is not configured.");
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
