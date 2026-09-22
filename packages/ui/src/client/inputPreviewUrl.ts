/** A stored value stays JSON; the configured adapter alone interprets it. */
export function inputPreviewPath(args: {
  flowId: string
  nodeId: string
  field: string
  valueJson: string
}) {
  return `/api/flows/${encodeURIComponent(args.flowId)}/inputs/${encodeURIComponent(args.nodeId)}/${encodeURIComponent(args.field)}/preview?value=${encodeURIComponent(args.valueJson)}`
}
