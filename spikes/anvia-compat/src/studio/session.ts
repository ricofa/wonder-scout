import type { Agent, CompletionModel } from '@anvia/core';
import { Studio, StudioTraceObserver, createInMemoryStudioStore, type StudioTarget } from '@anvia/studio';
import type { McpServer } from '@anvia/mcp';
import { createScoutingAgent } from '../agent.js';
import { createScoutingPipeline } from '../pipeline.js';

/**
 * Studio serializes the Agent's model into its runtime view (`GET /agents/:id/runtime`), and the
 * browser reads that view. The real model holds the OpenAI-compatible client, which stores the API
 * key as a plain string. This wrapper exposes only metadata and delegates calls. The real model lives
 * in a closure, so it is not a property Studio can walk or serialize.
 */
export function opaqueModelForStudio(real: CompletionModel): CompletionModel {
  const wrapper: CompletionModel = {
    provider: real.provider,
    modelId: real.modelId,
    capabilities: real.capabilities,
    ...(real.contextLimits === undefined ? {} : { contextLimits: real.contextLimits }),
    ...(real.controls === undefined ? {} : { controls: real.controls }),
    completion: (request, options) => real.completion(request, options),
    ...(real.traceRequest === undefined ? {} : { traceRequest: (request, options) => real.traceRequest?.(request, options) }),
  };
  return Object.freeze(wrapper);
}

/**
 * Registers the EXISTING synthetic Agent and Pipeline (one instance each) in Anvia Studio.
 * No new Agent or Pipeline logic is created here. Studio's own trace observer is attached to the
 * Agent only; Studio records Pipeline runs itself. Has no side effects, so tests can import it.
 */
export function createStudioSession(model: CompletionModel, mcpServers: readonly McpServer[]) {
  const traces = createInMemoryStudioStore();
  const agent = createScoutingAgent(opaqueModelForStudio(model), {
    mcpServers,
    observability: {
      observers: { studio: new StudioTraceObserver({ store: traces }) },
      primaryTrace: 'studio',
    },
  });
  const pipeline = createScoutingPipeline(agent);
  // Studio types targets as Agent<string>; this Agent has a typed outputSchema, which makes the
  // lifecycle callbacks incompatible at the type level only. Runtime behavior is unchanged.
  const studioAgent = agent as unknown as Agent as StudioTarget;
  const studio = new Studio([studioAgent, pipeline], { stores: { traces } });
  return { agent, pipeline, studio };
}
