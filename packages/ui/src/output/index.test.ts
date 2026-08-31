import { describe, expect, it } from 'vitest'
import * as jobikUi from '#index.js'
import * as output from './index.js'

describe('the output module surface', () => {
  it('exports everything P14 and a flow extension need', () => {
    for (const name of [
      'OutputViewer',
      'OutputDock',
      'OutputHeader',
      'OutputBody',
      'OutputPreview',
      'PrimaryImage',
      'OutputMetadataRow',
      'VariantRow',
      'TypedValueGrid',
      'ImageFrame',
      'RawJson',
      'LogLines',
      'GenericOutput',
      'resolveOutputComponent',
      'defineFlowUi',
      'isFlowUiDescriptor',
      'isAssetDescriptor',
      'formatRawJson',
      'rawJsonToneColors',
      'resolveTypedValueTone',
      'formatBytes',
      'groupDigits',
      'outputColors',
      'outputMetrics',
      'outputHeaderMeta',
      'OUTPUT_TABS',
    ]) {
      expect(output, name).toHaveProperty(name)
    }
  })

  it('reaches the package barrel unchanged', () => {
    expect(jobikUi.defineFlowUi).toBe(output.defineFlowUi)
    expect(jobikUi.OutputViewer).toBe(output.OutputViewer)
    expect(jobikUi.OutputDock).toBe(output.OutputDock)
    expect(jobikUi.isAssetDescriptor).toBe(output.isAssetDescriptor)
  })

  it("keeps the barrel append-only — P4's and P7's exports still resolve", () => {
    expect(jobikUi.Studio).toBeDefined()
    expect(jobikUi.FlowCanvas).toBeDefined()
    expect(jobikUi.NodeOutputSlot).toBeDefined()
  })
})
