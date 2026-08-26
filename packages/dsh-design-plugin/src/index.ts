/**
 * Design plugin host half: registers the `design_locate_source` tool that maps
 * a captured element selection back to the workspace files that mention it,
 * plus the prompt section teaching the agent the design-mode workflow.
 * @module @dpsagent/dsh-design-plugin
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { locateSource, type LocateResult } from './locate.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'design'

/** Services required before the tool and prompt section can register. */
export const inject = ['tools', 'systemPrompt']

/** Cooperative tool-call timeout budget (ms); the scan forwards no signal, so keep it short and bounded. */
const LOCATE_TIMEOUT_MS = 15_000

/**
 * Register the design-mode tool suite and workflow guidance.
 * @param ctx - plugin context; registrations are effects scoped to this plugin.
 */
export function apply(ctx: Context): void {
  ctx.systemPrompt.section({
    name: 'tool:design_locate_source',
    order: 104,
    text: 'Use the design_locate_source tool to find the source file that renders a selected web element: '
      + 'pass the element\'s visible text (and optionally a workspace path) and it returns file:line matches. '
      + 'Then open the file with read and apply the requested change with edit.',
  })

  const tool = defineTool({
    name: 'design_locate_source',
    description: 'Locate the source files that render a web element selected in design mode. '
      + 'Returns up to 100 file:line matches whose line contains the given text, '
      + 'searched recursively under the session workspace (or an explicit path), '
      + 'skipping node_modules, build output, and VCS metadata. '
      + 'Prefer this over a broad grep when the user cites an element and asks to change it.',
    parameters: {
      text: {
        type: 'string',
        required: true,
        description: 'The element text (or another exact string from it) to locate, e.g. a button label or heading text.',
      },
      path: {
        type: 'string',
        description: 'Directory to search. Defaults to the session workspace; a relative path resolves against it.',
      },
    },
    timeoutMs: LOCATE_TIMEOUT_MS,
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string', required: true },
          matches: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                file: { type: 'string', required: true },
                line: { type: 'integer', required: true },
                text: { type: 'string', required: true },
              },
            },
          },
          truncated: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => {
        const result = value as LocateResult
        if (result.matches.length === 0) {
          return [{ type: 'text', text: `No source reference found for "${result.query}".` }]
        }
        const lines = result.matches.map(match => `${match.file}:${match.line}  ${match.text}`)
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args, exec) {
      const root = args.path ?? exec.agent?.session.header.cwd ?? process.cwd()
      return locateSource(root, args.text)
    },
  })
  ctx.tools.register(tool)
}
