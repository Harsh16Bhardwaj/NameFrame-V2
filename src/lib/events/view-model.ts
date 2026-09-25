import type { CertificateTemplate, Event } from "@/generated/prisma/client";

type EventWithTemplate = Event & { template: CertificateTemplate | null };

export function eventViewModel(event: EventWithTemplate) {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    location: event.location,
    eventDate: event.eventDate?.toISOString() ?? null,
    certificateTitle: event.certificateTitle,
    emailSubject: event.emailSubject,
    emailBody: event.emailBody,
    status: event.status,
    organizationName: event.organizationName,
    organizationLogoUrl: event.organizationLogoUrl,
    template: event.template
      ? {
          id: event.template.id,
          backgroundUrl: event.template.backgroundUrl,
          nameLeft: Number(event.template.nameLeft),
          nameTop: Number(event.template.nameTop),
          nameRight: Number(event.template.nameRight),
          nameBottom: Number(event.template.nameBottom),
          fontSize: event.template.fontSize,
          fontColor: event.template.fontColor,
          fontWeight: event.template.fontWeight,
          textAlign: event.template.textAlign,
        }
      : null,
  };
}

export type EventViewModel = ReturnType<typeof eventViewModel>;
