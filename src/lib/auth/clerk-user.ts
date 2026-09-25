export type ClerkUserSnapshot = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  primaryEmailAddress: string;
  invitedOrganizationId?: string | null;
};

type ClerkEmailAddress = {
  id: string;
  email_address: string;
};

type ClerkWebhookUser = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  primary_email_address_id: string | null;
  email_addresses: ClerkEmailAddress[];
};

export function clerkWebhookUserToSnapshot(user: ClerkWebhookUser): ClerkUserSnapshot {
  const primaryEmail =
    user.email_addresses.find((email) => email.id === user.primary_email_address_id) ??
    user.email_addresses[0];

  if (!primaryEmail) {
    throw new Error("Clerk user has no email address");
  }

  return {
    id: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    primaryEmailAddress: primaryEmail.email_address,
  };
}

export function buildLocalUserValues(user: ClerkUserSnapshot) {
  const email = user.primaryEmailAddress.trim().toLowerCase();
  const fullName = [user.firstName?.trim(), user.lastName?.trim()].filter(Boolean).join(" ");

  if (!email) {
    throw new Error("Clerk user has no usable email address");
  }

  return {
    clerkUserId: user.id,
    email,
    name: fullName || email,
  };
}
