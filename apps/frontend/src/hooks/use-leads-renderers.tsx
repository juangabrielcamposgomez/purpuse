import { useRenderTool, useDefaultRenderTool } from "@copilotkit/react-core/v2";
import { z } from "zod";
import { StrategicPositioning } from "@/components/health/StrategicPositioning";
import { OnboardingForm } from "@/components/health/OnboardingForm";
import { NetworkingRecommendations } from "@/components/health/NetworkingRecommendations";
import { SleepMetricsDashboard } from "@/components/health/SleepMetricsDashboard";
import { ContentStrategyCard } from "@/components/health/ContentStrategyCard";
import { LeadMiniCard } from "@/components/leads/inline/LeadMiniCard";
import { EmailDraftCard } from "@/components/leads/inline/EmailDraftCard";
import { ToolFallbackCard } from "@/components/copilot/ToolFallbackCard";
import { WorkshopDemand } from "@/components/leads/WorkshopDemand";
import { useAgent } from "@copilotkit/react-core/v2";
import { initialState } from "@/lib/leads/state";
import type { AgentState } from "@/lib/leads/types";

function mergeAgentState(raw: unknown): AgentState {
  const partial =
    raw && typeof raw === "object" ? (raw as Partial<AgentState>) : {};
  return {
    ...initialState,
    ...partial,
    filter: { ...initialState.filter, ...(partial.filter ?? {}) },
    header: { ...initialState.header, ...(partial.header ?? {}) },
    sync: { ...initialState.sync, ...(partial.sync ?? {}) },
    leads: partial.leads ?? initialState.leads,
    highlightedLeadIds:
      partial.highlightedLeadIds ?? initialState.highlightedLeadIds,
  };
}

function useLiveAgentState() {
  const { agent } = useAgent();
  const state = mergeAgentState(agent?.state);
  const setState = (updater: (prev: AgentState) => AgentState) => {
    agent?.setState(updater(mergeAgentState(agent?.state)));
  };
  return { agent, state, setState };
}

function LiveWorkshopDemand() {
  const { state, setState } = useLiveAgentState();
  return (
    <div className="my-2">
      <WorkshopDemand
        leads={state.leads}
        selectedWorkshops={state.filter.workshops}
        compact
        onPickWorkshop={(w) =>
          setState((prev) => {
            const has = prev.filter.workshops.includes(w);
            return {
              ...prev,
              filter: {
                ...prev.filter,
                workshops: has
                  ? prev.filter.workshops.filter((x) => x !== w)
                  : [...prev.filter.workshops, w],
              },
            };
          })
        }
      />
    </div>
  );
}

export function useLeadsRenderers(
  injectPrompt: (prompt: string) => void,
  updateState: (updater: (prev: AgentState) => AgentState) => void
) {
  useRenderTool({
    name: "renderStrategicPositioning",
    parameters: z.object({
      roadmap: z.array(z.object({
        phase: z.string(),
        title: z.string(),
        tasks: z.array(z.string()),
        status: z.enum(["Upcoming", "Active", "Completed"]),
      })),
    }),
    render: ({ parameters }) => <StrategicPositioning roadmap={parameters.roadmap || []} />,
  });

  useRenderTool({
    name: "renderOnboardingForm",
    parameters: z.object({
      specialty: z.string(),
    }),
    render: ({ parameters }) => (
      <OnboardingForm
        specialty={parameters.specialty || ""}
        onComplete={(data) => {
          injectPrompt(`User completed onboarding for ${parameters.specialty || "professional"}: ${JSON.stringify(data)}. Generate the initial dashboard and growth strategy.`);
        }}
      />
    ),
  });

  useRenderTool({
    name: "renderNetworkingRecommendations",
    parameters: z.object({
      recommendations: z.array(z.object({
        type: z.enum(["Clinic", "Podcast", "Community", "Specialist"]),
        name: z.string(),
        description: z.string(),
        action: z.string(),
        relevance: z.string(),
      })),
    }),
    render: ({ parameters }) => <NetworkingRecommendations recommendations={parameters.recommendations || []} />,
  });

  useRenderTool({
    name: "renderSleepMetricsDashboard",
    parameters: z.object({
      data: z.object({
        duration: z.number(),
        deepSleep: z.number(),
        remSleep: z.number(),
        efficiency: z.number(),
        score: z.number(),
      }),
    }),
    render: ({ parameters }) => parameters.data ? <SleepMetricsDashboard data={parameters.data} /> : <></>,
  });

  useRenderTool({
    name: "renderContentStrategyCard",
    parameters: z.object({
      data: z.object({
        topic: z.string(),
        platforms: z.array(z.string()),
        keyPoints: z.array(z.string()),
        scheduledDate: z.string(),
        cta: z.string(),
      }),
    }),
    render: ({ parameters }) => parameters.data ? <ContentStrategyCard data={parameters.data} /> : <></>,
  });

  useRenderTool({
    name: "renderLeadMiniCard",
    parameters: z.object({
      leadId: z.string(),
      name: z.string().optional(),
      role: z.string().optional(),
      company: z.string().optional(),
      email: z.string().optional(),
      workshop: z.string().optional(),
      technical_level: z.string().optional(),
    }),
    render: ({ parameters }) => (
      <LeadMiniCard
        leadId={parameters.leadId}
        name={parameters.name}
        role={parameters.role}
        company={parameters.company}
        email={parameters.email}
        workshop={parameters.workshop}
        technical_level={parameters.technical_level}
        onSelect={(id) =>
          updateState((prev) => ({ ...prev, selectedLeadId: id }))
        }
      />
    ),
  });

  useRenderTool({
    name: "renderWorkshopDemand",
    parameters: z.object({}),
    render: () => <LiveWorkshopDemand />,
  });

  useRenderTool({
    name: "renderEmailDraft",
    parameters: z.object({
      leadId: z.string(),
      leadName: z.string().optional(),
      leadEmail: z.string().optional(),
      subject: z.string(),
      body: z.string(),
    }),
    render: ({ parameters }) => {
      if (!parameters.leadId || !parameters.subject || !parameters.body) {
        return (
          <div className="my-2 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-2.5 py-1 text-[11px] text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-[#BEC2FF]" />
            <span className="font-mono">Drafting email…</span>
          </div>
        );
      }
      return (
        <EmailDraftCard
          leadId={parameters.leadId}
          leadName={parameters.leadName}
          leadEmail={parameters.leadEmail}
          initialSubject={parameters.subject}
          initialBody={parameters.body}
          onSend={(final) =>
            injectPrompt(
              `The user approved the email draft for lead ${parameters.leadId}. Post it as a Notion comment by calling post_lead_comment with leadId=${JSON.stringify(parameters.leadId)}, subject=${JSON.stringify(final.subject)}, body=${JSON.stringify(final.body)}. Do not modify the wording.`,
            )
          }
          onRegenerate={() =>
            injectPrompt(
              `Regenerate the outreach email draft for lead ${parameters.leadId} and call renderEmailDraft again with the new version.`,
            )
          }
        />
      );
    },
  });

  useDefaultRenderTool({
    render: ({ name, status, result, parameters }: any) => (
      <ToolFallbackCard
        name={name}
        status={status}
        result={result}
        parameters={parameters}
      />
    ),
  });
}
