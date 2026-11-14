import { Badge } from "@/components/ui/Badge";
import { APPLICATION_STATUS_LABELS, APPLICATION_STATUS_TONES } from "@/lib/applications/constants";
import { RECORD_STATUS_LABELS, RECORD_STATUS_TONES } from "@/lib/business/constants";
import type { BusinessRecordStatus, DbApplicationStatus } from "@/lib/database.types";

export function ApplicationStatusBadge({ status }: { status: DbApplicationStatus }) {
  return <Badge tone={APPLICATION_STATUS_TONES[status]}>{APPLICATION_STATUS_LABELS[status]}</Badge>;
}

export function RecordStatusBadge({ status }: { status: BusinessRecordStatus }) {
  return <Badge tone={RECORD_STATUS_TONES[status]}>{RECORD_STATUS_LABELS[status]}</Badge>;
}
