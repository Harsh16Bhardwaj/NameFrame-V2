import { headers } from "next/headers";
import { Webhook } from "svix";

import { clerkWebhookUserToSnapshot } from "@/lib/auth/clerk-user";
import { syncLocalUser } from "@/lib/auth/user-sync";
import { AppError } from "@/lib/errors/app-error";
import { errorResponse } from "@/lib/errors/http";

type ClerkWebhookEvent = {
  type: string;
  data: Parameters<typeof clerkWebhookUserToSnapshot>[0];
};

export async function POST(request: Request) {
  try {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
      throw new AppError("INTERNAL_ERROR", "Clerk webhook is not configured.");
    }

    const headerStore = await headers();
    const svixId = headerStore.get("svix-id");
    const svixTimestamp = headerStore.get("svix-timestamp");
    const svixSignature = headerStore.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      throw new AppError("VALIDATION_ERROR", "Missing webhook signature headers.");
    }

    const body = await request.text();
    const event = new Webhook(secret).verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkWebhookEvent;

    if (event.type === "user.created" || event.type === "user.updated") {
      await syncLocalUser(clerkWebhookUserToSnapshot(event.data));
    }

    return Response.json({ received: true });
  } catch (error) {
    return errorResponse(error);
  }
}

