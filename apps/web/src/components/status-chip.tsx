import { CheckCircle2, CircleDashed, Clock3, FileEdit, Hourglass, TriangleAlert } from "lucide-react";

type Tone = "neutral" | "draft" | "waiting" | "action" | "success";
const tones: Record<Tone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  draft: "border-sky-200 bg-sky-50 text-sky-800",
  waiting: "border-indigo-200 bg-indigo-50 text-indigo-800",
  action: "border-amber-300 bg-amber-50 text-amber-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
};
const config: Record<string, { label: string; tone: Tone; icon: typeof Clock3 }> = {
  NOT_STARTED: { label: "Not started", tone: "neutral", icon: CircleDashed },
  DRAFT: { label: "Draft saved", tone: "draft", icon: FileEdit },
  SUBMITTED: { label: "Submitted", tone: "waiting", icon: Hourglass },
  EXTERNAL_SUBMITTED: { label: "Guarantor submitted", tone: "waiting", icon: Hourglass },
  CHANGES_REQUIRED: { label: "Changes requested", tone: "action", icon: TriangleAlert },
  APPROVED: { label: "Approved", tone: "success", icon: CheckCircle2 },
};
/** Colour is never the only signal: every chip also has an icon and a text label. */
export function StatusChip({ status, label }: { status: string; label?: string }) {
  const c = config[status] ?? { label: status.replaceAll("_", " ").toLowerCase(), tone: "neutral" as Tone, icon: Clock3 };
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[c.tone]}`}>
      <Icon size={13} aria-hidden="true" />
      {label ?? c.label}
    </span>
  );
}
