import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { planningApi, type PlanningState } from "../api/planning";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  Loader2,
  MessageSquare,
  Send,
  X,
} from "lucide-react";

/* ---- Props ---- */

interface PlanningPanelProps {
  issueId: string;
  /** Called after the planning session is approved and the spec is ready. */
  onApproved?: (spec: string) => void;
  /** Called when the user cancels the session. */
  onCancel?: () => void;
}

/* ---- Polling interval ---- */
const POLL_INTERVAL_MS = 2000;

/* ---- Component ---- */

export function PlanningPanel({ issueId, onApproved, onCancel }: PlanningPanelProps) {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);

  // ---- Query: current planning state (doubles as poll) ----
  const planningKey = queryKeys.issues.planning(issueId);

  const {
    data: state,
    isLoading,
  } = useQuery({
    queryKey: planningKey,
    queryFn: () => planningApi.poll(issueId),
    refetchInterval: (query) => {
      const d = query.state.data as PlanningState | undefined;
      // Keep polling while the LLM is thinking
      if (d?.active && d.status === "thinking") return POLL_INTERVAL_MS;
      return false;
    },
  });

  // ---- Mutations ----
  const startMutation = useMutation({
    mutationFn: () => planningApi.start(issueId),
    onSuccess: (data) => {
      queryClient.setQueryData(planningKey, data);
    },
  });

  const answerMutation = useMutation({
    mutationFn: ({ questionId, answer }: { questionId: string; answer: string }) =>
      planningApi.submitAnswer(issueId, questionId, answer),
    onSuccess: (data) => {
      queryClient.setQueryData(planningKey, data);
      setSelectedAnswer(null);
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => planningApi.approve(issueId),
    onSuccess: (data) => {
      queryClient.setQueryData(planningKey, data);
      if (data.spec) onApproved?.(data.spec);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => planningApi.cancel(issueId),
    onSuccess: () => {
      queryClient.setQueryData(planningKey, { active: false });
      onCancel?.();
    },
  });

  // ---- Auto-scroll to bottom when conversation grows ----
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state?.conversation?.length]);

  // ---- Handlers ----
  const handleSubmitAnswer = useCallback(() => {
    if (!selectedAnswer || !state?.currentQuestion) return;
    answerMutation.mutate({ questionId: state.currentQuestion.id, answer: selectedAnswer });
  }, [selectedAnswer, state?.currentQuestion, answerMutation]);

  // ---- Not active: show start button ----
  if (!state?.active && !isLoading) {
    return (
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <MessageSquare className="h-4 w-4" />
            Planning
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Start a planning session to refine the specification for this issue through a guided Q&amp;A.
          </p>
          <Button
            size="sm"
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending}
          >
            {startMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
            ) : null}
            Start Planning
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="rounded-lg">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const conversation = state?.conversation ?? [];
  const currentQuestion = state?.currentQuestion ?? null;
  const isThinking = state?.status === "thinking";
  const isSpecReady = state?.status === "spec_ready";
  const isApproved = state?.status === "approved" || state?.status === "complete";

  return (
    <Card className="rounded-lg">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-sm">
          <MessageSquare className="h-4 w-4" />
          Planning Session
        </CardTitle>
        {!isApproved && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </CardHeader>

      <Separator />

      {/* ---- Conversation history ---- */}
      <ScrollArea className="max-h-80" ref={scrollRef}>
        <div className="px-4 py-3 space-y-3">
          {conversation.map((entry, i) => (
            <div
              key={i}
              className={cn(
                "text-sm rounded-md px-3 py-2",
                entry.role === "assistant"
                  ? "bg-muted text-foreground"
                  : "bg-primary/10 text-foreground ml-6",
              )}
            >
              <span className="font-medium text-xs text-muted-foreground block mb-0.5">
                {entry.role === "assistant" ? "Assistant" : "You"}
              </span>
              {entry.content}
            </div>
          ))}

          {/* Thinking indicator */}
          {isThinking && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground px-3 py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Thinking…
            </div>
          )}
        </div>
      </ScrollArea>

      {/* ---- Current question with options ---- */}
      {currentQuestion && !isThinking && (
        <>
          <Separator />
          <CardContent className="pt-4">
            <p className="text-sm font-medium mb-3">{currentQuestion.text}</p>
            <div className="space-y-2">
              {currentQuestion.options.map((opt) => (
                <label
                  key={opt.value}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors",
                    selectedAnswer === opt.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50",
                  )}
                >
                  <input
                    type="radio"
                    name={`planning-q-${currentQuestion.id}`}
                    value={opt.value}
                    checked={selectedAnswer === opt.value}
                    onChange={() => setSelectedAnswer(opt.value)}
                    className="accent-primary h-3.5 w-3.5"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </CardContent>
          <CardFooter className="gap-2">
            <Button
              size="sm"
              onClick={handleSubmitAnswer}
              disabled={!selectedAnswer || answerMutation.isPending}
            >
              {answerMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
              ) : (
                <Send className="h-3 w-3 mr-1.5" />
              )}
              Submit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            >
              Cancel
            </Button>
          </CardFooter>
        </>
      )}

      {/* ---- Spec preview ---- */}
      {isSpecReady && state?.spec && (
        <>
          <Separator />
          <CardContent className="pt-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">Generated Specification</p>
            <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap font-mono max-h-60 overflow-y-auto">
              {state.spec}
            </div>
          </CardContent>
          <CardFooter className="gap-2">
            <Button
              size="sm"
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
              ) : (
                <CheckCircle2 className="h-3 w-3 mr-1.5" />
              )}
              Approve &amp; Proceed
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            >
              Cancel
            </Button>
          </CardFooter>
        </>
      )}

      {/* ---- Approved state ---- */}
      {isApproved && (
        <>
          <Separator />
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              Specification approved
            </div>
          </CardContent>
        </>
      )}
    </Card>
  );
}
