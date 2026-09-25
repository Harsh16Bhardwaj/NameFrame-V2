CREATE INDEX "Participant_eventId_deletedAt_createdAt_id_idx"
ON "Participant"("eventId", "deletedAt", "createdAt" DESC, "id" DESC);

CREATE INDEX "Participant_eventId_deletedAt_eligibleForCertificate_createdAt_idx"
ON "Participant"("eventId", "deletedAt", "eligibleForCertificate", "createdAt" DESC);
