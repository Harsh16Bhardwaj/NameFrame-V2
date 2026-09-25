import { AppError, isAppError } from "@/lib/errors/app-error";

export function errorResponse(error: unknown): Response {
  if (isAppError(error)) {
    return Response.json(
      {
        success: false,
        error: { code: error.code, message: error.message },
      },
      { status: error.status },
    );
  }

  console.error("Unexpected application error", {
    type: error instanceof Error ? error.name : typeof error,
  });

  return Response.json(
    {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
      },
    },
    { status: 500 },
  );
}

export function assertNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AppError("VALIDATION_ERROR", `${fieldName} is required.`);
  }

  return value.trim();
}
