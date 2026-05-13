import { useRenderTool, useDefaultRenderTool } from "@copilotkit/react-core/v2";
import { Database } from "lucide-react";
import { z } from "zod";
import { StrategicPositioning } from "@/components/health/StrategicPositioning";
import { OnboardingForm } from "@/components/health/OnboardingForm";
import { ProfessionalOnboarding } from "@/components/health/ProfessionalOnboarding";
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
    name: "renderProfessionalOnboarding",
    parameters: z.object({
      specialty: z.string().optional(),
    }),
    render: ({ parameters }) => (
      <ProfessionalOnboarding
        specialty={parameters.specialty}
        onComplete={(data) => {
          injectPrompt(`User completed the 4 Pillars Audit for ${data.specialty}: ${JSON.stringify(data.answers)}. Analyze these requirements and generate a comprehensive plan focusing on Posicionamiento, Visibilidad, Identidad y Humanización.`);
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
    name: "renderSocialConnectHub",
    parameters: z.object({
      connections: z.array(z.object({
        platform: z.string(),
        status: z.enum(["Connected", "Disconnected"]),
        lastSync: z.string().optional(),
      })),
    }),
    render: ({ parameters }) => (
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm text-slate-900">
        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
          <span className="size-2 bg-green-500 rounded-full animate-pulse" />
          Hub de Conexiones Sociales
        </h3>
        <div className="space-y-3">
          {parameters.connections?.map((conn: any) => (
            <div key={conn.platform} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
              <span className="capitalize font-medium">{conn.platform}</span>
              <span className={`text-xs px-2 py-1 rounded-full ${conn.status === 'Connected' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                {conn.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
  });

  useRenderTool({
    name: "renderDataConnectorHub",
    parameters: z.object({
      activeConnectors: z.array(z.string()).optional(),
    }),
    render: ({ parameters }) => (
      <div className="flex flex-col rounded-3xl border border-slate-200 bg-white p-8 text-slate-900 shadow-xl max-w-2xl mx-auto overflow-hidden relative">
        <div className="absolute -top-24 -right-24 size-48 bg-blue-500/10 blur-3xl rounded-full" />
        
        <header className="mb-8 relative">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-blue-50 rounded-xl ring-1 ring-blue-100">
              <Database className="size-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Centro de Datos</h2>
              <p className="text-sm text-slate-500 font-medium">Conecta tu práctica médica con Purpose360</p>
            </div>
          </div>
        </header>

        <div className="grid gap-4 relative">
          {[
            { id: "notion", label: "Notion CRM", description: "Gestión de leads y pacientes", icon: "N" },
            { id: "sheets", label: "Google Sheets", description: "Registros históricos y seguimiento", icon: "G" },
            { id: "medical_crm", label: "CRM Médico", description: "Integración vía API (Vera, Doctoralia)", icon: "M" },
          ].map((connector) => {
            const isActive = parameters.activeConnectors?.includes(connector.id);
            return (
              <div
                key={connector.id}
                className="flex items-center justify-between p-5 rounded-2xl bg-slate-50 border border-slate-100 hover:border-blue-500/30 transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="size-12 flex items-center justify-center bg-white rounded-xl shadow-sm font-bold text-blue-600 border border-slate-100 group-hover:bg-blue-50">
                    {connector.icon}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800">{connector.label}</h4>
                    <p className="text-xs text-slate-500">{connector.description}</p>
                  </div>
                </div>
                
                {isActive ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-full text-xs font-bold ring-1 ring-emerald-100">
                    <span className="size-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    Conectado
                  </div>
                ) : (
                  <button className="px-4 py-2 bg-white text-blue-600 border border-blue-200 rounded-xl text-xs font-bold hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all shadow-sm">
                    Conectar
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    ),
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
