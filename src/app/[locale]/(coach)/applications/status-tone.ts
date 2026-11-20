import type { StatusTone } from "@/components/status-badge";
import type { ApplicationStatus } from "@/domain/coaching-applications/schema";

export const STATUS_TONE: Record<ApplicationStatus, StatusTone> = {
  new: "accent",
  reviewing: "warning",
  accepted: "success",
  rejected: "destructive",
};
