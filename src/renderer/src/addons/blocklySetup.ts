// Registriert die VibeDesk-Bausteine bei Blockly (einmalig) und liefert das dunkle Glas-Theme.
import * as Blockly from 'blockly/core'
import 'blockly/blocks'
import * as De from 'blockly/msg/de'
import { blockJson, PALETTE, VD_BLOCKS, type AssetSource } from './blocklyDefs'

let current: AssetSource = { images: () => [], sounds: () => [], prompts: () => [] }

/** Der Maker setzt hier die Inhalte des gerade offenen Addons – Dropdowns lesen sie live. */
export function setAssetSource(src: AssetSource): void {
  current = src
}

const live: AssetSource = {
  images: () => current.images(),
  sounds: () => current.sounds(),
  prompts: () => current.prompts()
}

let registered = false
export function registerBlocks(): void {
  if (registered) return
  registered = true
  Blockly.setLocale(De as unknown as Record<string, string>)
  for (const spec of VD_BLOCKS) {
    const json = blockJson(spec, live)
    Blockly.Blocks[spec.type] = {
      init(this: Blockly.Block) {
        this.jsonInit(json)
      }
    }
  }
}

const style = (k: keyof typeof PALETTE): { colourPrimary: string; colourSecondary: string; colourTertiary: string } => ({
  colourPrimary: PALETTE[k].fill,
  colourSecondary: PALETTE[k].field,
  colourTertiary: PALETTE[k].line
})

export function vibedeskTheme(): Blockly.Theme {
  return Blockly.Theme.defineTheme('vibedesk', {
    name: 'vibedesk',
    base: Blockly.Themes.Classic,
    blockStyles: {
      vd_event: style('vd_event'),
      vd_action: style('vd_action'),
      vd_logic: style('vd_logic'),
      vd_value: style('vd_value'),
      vd_variable: style('vd_variable'),
      logic_blocks: style('vd_logic'),
      loop_blocks: style('vd_logic'),
      math_blocks: style('vd_value'),
      text_blocks: style('vd_value'),
      variable_blocks: style('vd_variable'),
      variable_dynamic_blocks: style('vd_variable')
    },
    categoryStyles: {},
    componentStyles: {
      workspaceBackgroundColour: 'rgba(10,14,22,0.55)',
      toolboxBackgroundColour: 'rgba(255,255,255,0.02)',
      toolboxForegroundColour: '#c9d2e6',
      flyoutBackgroundColour: '#0f1420',
      flyoutForegroundColour: '#c9d2e6',
      flyoutOpacity: 1,
      scrollbarColour: '#ffffff',
      scrollbarOpacity: 0.12,
      insertionMarkerColour: '#9fb8ff',
      insertionMarkerOpacity: 0.35,
      cursorColour: '#9fb8ff',
      selectedGlowColour: '#9fb8ff',
      selectedGlowOpacity: 0.4
    },
    fontStyle: { family: 'Inter, system-ui, sans-serif', weight: '500', size: 11 },
    startHats: false
  })
}
