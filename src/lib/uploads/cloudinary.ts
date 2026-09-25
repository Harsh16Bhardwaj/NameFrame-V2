import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

import { AppError } from "@/lib/errors/app-error";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg"]);

function configureCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new AppError("UPLOAD_FAILED", "Image storage is not configured.");
  }

  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
}

export function validateImageFile(file: File): void {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new AppError("INVALID_UPLOAD_TYPE", "Only PNG and JPEG images are supported.");
  }

  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    throw new AppError("UPLOAD_TOO_LARGE", "The image must be no larger than 10 MB.");
  }
}

export async function uploadImage(file: File, folder: string): Promise<UploadApiResponse> {
  validateImageFile(file);
  configureCloudinary();

  try {
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    return await cloudinary.uploader.upload(`data:${file.type};base64,${data}`, {
      folder,
      resource_type: "image",
      allowed_formats: ["png", "jpg", "jpeg"],
    });
  } catch (error) {
    throw new AppError("UPLOAD_FAILED", "The image upload failed. Please retry.", {
      cause: error,
      classification: "RETRYABLE",
    });
  }
}

export async function destroyImage(publicId: string): Promise<void> {
  configureCloudinary();
  await cloudinary.uploader.destroy(publicId, { resource_type: "image", invalidate: true });
}
