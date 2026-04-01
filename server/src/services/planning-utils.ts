export interface PlanningSpec {
  title: string;
  summary: string;
  deliverables: string[];
  success_criteria: string[];
  constraints: Record<string, unknown>;
  execution_plan?: {
    approach: string;
    steps: string[];
  };
}

/**
 * Extract JSON from an LLM response that may contain markdown code blocks.
 * Handles: direct JSON, ```json ... ```, embedded {...} in text.
 */
export function extractJSON(text: string): object | null {
  // 1. Try direct parse
  try {
    return JSON.parse(text);
  } catch {
    // continue
  }

  // 2. Try ```json ... ``` blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // continue
    }
  }

  // 3. Try to find first { ... } pair
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch {
      // continue
    }
  }

  return null;
}

/**
 * Build the initial planning system prompt for an issue.
 */
export function buildPlanningPrompt(issue: {
  title: string;
  description: string | null;
}): string {
  return `You are a planning assistant for software engineering tasks. Your job is to ask the user clarifying questions to build a detailed specification before work begins.

You are planning the following issue:
- Title: ${issue.title}
- Description: ${issue.description ?? "(no description)"}

Your task is to ask 3-5 focused multiple-choice questions to clarify scope, approach, and constraints. Ask ONE question at a time.

For each question, respond with ONLY valid JSON in this format:
{
  "type": "question",
  "question": "Your question text here?",
  "options": [
    { "id": "a", "label": "Option A description" },
    { "id": "b", "label": "Option B description" },
    { "id": "c", "label": "Option C description" },
    { "id": "other", "label": "Other (please specify)" }
  ]
}

When you have gathered enough information (typically after 3-5 questions), respond with a completed spec in this format:
{
  "type": "spec",
  "title": "Refined issue title",
  "summary": "Clear summary of what needs to be done",
  "deliverables": ["Deliverable 1", "Deliverable 2"],
  "success_criteria": ["Criterion 1", "Criterion 2"],
  "constraints": {},
  "execution_plan": {
    "approach": "High-level approach description",
    "steps": ["Step 1", "Step 2"]
  }
}

IMPORTANT: Always respond with valid JSON only. No extra text outside the JSON.
Start by asking the first clarifying question.`;
}

/**
 * Build the answer follow-up prompt.
 */
export function buildAnswerPrompt(answer: string, otherText?: string): string {
  if (otherText) {
    return `The user selected: "${answer}" and provided additional detail: "${otherText}"

Based on their answer, either ask the next clarifying question (using the same JSON question format) or, if you have enough information, generate the final spec (using the JSON spec format). Respond with ONLY valid JSON.`;
  }
  return `The user selected: "${answer}"

Based on their answer, either ask the next clarifying question (using the same JSON question format) or, if you have enough information, generate the final spec (using the JSON spec format). Respond with ONLY valid JSON.`;
}

/**
 * Generate spec markdown from a completed planning spec.
 */
export function generateSpecMarkdown(
  issue: { title: string; description: string | null },
  spec: PlanningSpec,
): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push("## 📋 Planning Spec");
  lines.push("");
  lines.push(`**${spec.title}**`);
  lines.push("");
  lines.push(`### Summary`);
  lines.push(spec.summary);
  lines.push("");

  if (spec.deliverables.length > 0) {
    lines.push("### Deliverables");
    for (const d of spec.deliverables) {
      lines.push(`- ${d}`);
    }
    lines.push("");
  }

  if (spec.success_criteria.length > 0) {
    lines.push("### Success Criteria");
    for (const c of spec.success_criteria) {
      lines.push(`- ${c}`);
    }
    lines.push("");
  }

  if (spec.execution_plan) {
    lines.push("### Execution Plan");
    lines.push(`**Approach:** ${spec.execution_plan.approach}`);
    lines.push("");
    if (spec.execution_plan.steps.length > 0) {
      lines.push("**Steps:**");
      for (let i = 0; i < spec.execution_plan.steps.length; i++) {
        lines.push(`${i + 1}. ${spec.execution_plan.steps[i]}`);
      }
      lines.push("");
    }
  }

  if (spec.constraints && Object.keys(spec.constraints).length > 0) {
    lines.push("### Constraints");
    const keys = Object.keys(spec.constraints);
    for (const key of keys) {
      lines.push(`- **${key}:** ${String(spec.constraints[key])}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");

  return lines.join("\n");
}
