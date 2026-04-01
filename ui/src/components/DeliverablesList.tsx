import { useQuery } from "@tanstack/react-query";
import { issueTransparencyApi, type Deliverable, type DeliverableType } from "../api/issue-transparency";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Code2,
  FileText,
  FlaskConical,
  Loader2,
  Package,
  Settings,
  FileBox,
  ExternalLink,
} from "lucide-react";

/* ---- Props ---- */

interface DeliverablesListProps {
  issueId: string;
}

/* ---- Deliverable type config ---- */

const DELIVERABLE_TYPE_CONFIG: Record<
  DeliverableType,
  { icon: React.ElementType; label: string; color: string }
> = {
  code: { icon: Code2, label: "Code", color: "text-green-500" },
  documentation: { icon: FileText, label: "Documentation", color: "text-blue-500" },
  test: { icon: FlaskConical, label: "Test", color: "text-purple-500" },
  config: { icon: Settings, label: "Config", color: "text-amber-500" },
  artifact: { icon: Package, label: "Artifact", color: "text-orange-500" },
  other: { icon: FileBox, label: "Other", color: "text-muted-foreground" },
};

/* ---- Deliverable card ---- */

function DeliverableCard({ deliverable }: { deliverable: Deliverable }) {
  const config = DELIVERABLE_TYPE_CONFIG[deliverable.type] ?? DELIVERABLE_TYPE_CONFIG.other;
  const Icon = config.icon;

  return (
    <div className="flex items-start gap-3 rounded-md border bg-background p-3">
      {/* Type icon */}
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-muted/50",
          config.color,
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">
            {deliverable.title}
          </span>
          <Badge
            variant={deliverable.status === "final" ? "default" : "secondary"}
            className={cn(
              "text-[10px] px-1.5 py-0",
              deliverable.status === "final"
                ? "bg-green-500/10 text-green-600 border-green-500/20"
                : "bg-muted text-muted-foreground",
            )}
          >
            {deliverable.status}
          </Badge>
        </div>

        {deliverable.description && (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
            {deliverable.description}
          </p>
        )}

        {deliverable.filePath && (
          <div className="mt-1.5 flex items-center gap-1 text-xs text-primary/80 hover:text-primary">
            <ExternalLink className="h-3 w-3" />
            <span className="font-mono truncate">{deliverable.filePath}</span>
          </div>
        )}

        <span className={cn("mt-1 text-[10px]", config.color)}>{config.label}</span>
      </div>
    </div>
  );
}

/* ---- Main component ---- */

export function DeliverablesList({ issueId }: DeliverablesListProps) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.issues.transparencyDeliverables(issueId),
    queryFn: () => issueTransparencyApi.listDeliverables(issueId),
    refetchInterval: 10000,
  });

  const deliverables = data?.items ?? [];

  if (isLoading) {
    return (
      <Card className="rounded-lg">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (deliverables.length === 0) {
    return (
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Package className="h-4 w-4" />
            Deliverables
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No deliverables yet.</p>
        </CardContent>
      </Card>
    );
  }

  const finalCount = deliverables.filter((d) => d.status === "final").length;

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Package className="h-4 w-4" />
          Deliverables
          <span className="text-xs font-normal text-muted-foreground">
            ({finalCount}/{deliverables.length} final)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {deliverables.map((del) => (
          <DeliverableCard key={del.id} deliverable={del} />
        ))}
      </CardContent>
    </Card>
  );
}
