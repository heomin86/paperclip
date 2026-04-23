// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigateMock = vi.fn();
const hireMutateMock = vi.fn();
const invalidateQueriesMock = vi.fn();
let agentsList: Array<{ id: string; name: string }> | undefined = [];

vi.mock("@/lib/router", () => ({
  useNavigate: () => navigateMock,
  useSearchParams: () => [new URLSearchParams()],
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    const key = queryKey[0];
    if (key === "agents") return { data: agentsList };
    if (key === "companySkills") return { data: [] };
    if (key === "adapterModels") return { data: [], error: null, isLoading: false, isFetching: false };
    return { data: [] };
  },
  useMutation: () => ({
    mutate: hireMutateMock,
    isPending: false,
  }),
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}));

vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({ selectedCompanyId: "company-1" }),
}));

vi.mock("../context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({ setBreadcrumbs: vi.fn() }),
}));

vi.mock("../api/agents", () => ({ agentsApi: { list: vi.fn(), hire: vi.fn(), adapterModels: vi.fn() } }));
vi.mock("../api/companySkills", () => ({ companySkillsApi: { list: vi.fn() } }));
vi.mock("../lib/queryKeys", () => ({
  queryKeys: {
    agents: {
      list: () => ["agents"],
      adapterModels: () => ["adapterModels"],
    },
    companySkills: {
      list: () => ["companySkills"],
    },
    approvals: { list: () => ["approvals"] },
  },
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => <button {...props}>{children}</button>,
}));
vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ checked, onCheckedChange, ...props }: { checked?: boolean; onCheckedChange?: (next: boolean) => void } & React.ComponentProps<"input">) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      {...props}
    />
  ),
}));
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../lib/utils", () => ({
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(" "),
  agentUrl: (agent: { id: string }) => `/agents/${agent.id}`,
}));
vi.mock("../components/agent-config-primitives", () => ({
  roleLabels: {
    general: "General",
    ceo: "CEO",
    engineer: "Engineer",
  },
}));
vi.mock("../components/AgentConfigForm", () => ({
  AgentConfigForm: () => <div>AgentConfigForm</div>,
}));
vi.mock("../components/agent-config-defaults", () => ({
  defaultCreateValues: {
    adapterType: "process",
    heartbeatEnabled: true,
    intervalSec: 1800,
    model: "",
    dangerouslyBypassSandbox: false,
  },
}));
vi.mock("../adapters", () => ({
  getUIAdapter: () => ({
    buildAdapterConfig: () => ({}),
  }),
}));
vi.mock("../components/ReportsToPicker", () => ({
  ReportsToPicker: () => <div>ReportsToPicker</div>,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function setInputValue(node: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(node, value);
  node.dispatchEvent(new Event("input", { bubbles: true }));
}

import { NewAgent } from "./NewAgent";

describe("NewAgent", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    agentsList = [{ id: "agent-1", name: "CEO" }];
    navigateMock.mockReset();
    hireMutateMock.mockReset();
    invalidateQueriesMock.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("submits canCreateAgents when the permission toggle is enabled", () => {
    const root = createRoot(container);

    act(() => {
      root.render(<NewAgent />);
    });

    const nameInput = container.querySelector('input[placeholder="Agent name"]') as HTMLInputElement | null;
    expect(nameInput).not.toBeNull();

    act(() => {
      setInputValue(nameInput!, "Delegator");
    });

    const switches = Array.from(container.querySelectorAll('button[role="switch"]')) as HTMLButtonElement[];
    expect(switches).toHaveLength(1);

    act(() => {
      switches[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    const createButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Create agent"),
    ) as HTMLButtonElement | undefined;
    expect(createButton).toBeDefined();

    act(() => {
      createButton!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(hireMutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Delegator",
        role: "general",
        permissions: { canCreateAgents: true },
      }),
    );

    act(() => {
      root.unmount();
    });
  });

  it("does not grant agent creation by default for non-first agents", () => {
    const root = createRoot(container);

    act(() => {
      root.render(<NewAgent />);
    });

    const nameInput = container.querySelector('input[placeholder="Agent name"]') as HTMLInputElement | null;
    expect(nameInput).not.toBeNull();

    act(() => {
      setInputValue(nameInput!, "Regular Worker");
    });

    const createButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Create agent"),
    ) as HTMLButtonElement | undefined;
    expect(createButton).toBeDefined();

    act(() => {
      createButton!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(hireMutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "general",
        permissions: { canCreateAgents: false },
      }),
    );

    act(() => {
      root.unmount();
    });
  });

  it("does not grant agent creation before the agents list has loaded", () => {
    agentsList = undefined;
    const root = createRoot(container);

    act(() => {
      root.render(<NewAgent />);
    });

    const nameInput = container.querySelector('input[placeholder="Agent name"]') as HTMLInputElement | null;
    expect(nameInput).not.toBeNull();

    act(() => {
      setInputValue(nameInput!, "Loading State Worker");
    });

    const createButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Create agent"),
    ) as HTMLButtonElement | undefined;
    expect(createButton).toBeDefined();

    act(() => {
      createButton!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(hireMutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "general",
        permissions: { canCreateAgents: false },
      }),
    );

    act(() => {
      root.unmount();
    });
  });

  it("defaults the first agent to CEO agent-creation permission", () => {
    agentsList = [];
    const root = createRoot(container);

    act(() => {
      root.render(<NewAgent />);
    });

    const nameInput = container.querySelector('input[placeholder="Agent name"]') as HTMLInputElement | null;
    expect(nameInput).not.toBeNull();

    act(() => {
      setInputValue(nameInput!, "Founding CEO");
    });

    const createButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Create agent"),
    ) as HTMLButtonElement | undefined;
    expect(createButton).toBeDefined();

    act(() => {
      createButton!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(hireMutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "ceo",
        permissions: { canCreateAgents: true },
      }),
    );

    act(() => {
      root.unmount();
    });
  });
});
