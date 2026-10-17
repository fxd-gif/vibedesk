// Alle englischen Wörterbücher – je Bereich eine Datei, damit parallele Änderungen sich nicht in die Quere kommen.
import { registerEn } from '../../i18n'
import addons from './addons'
import core from './core'
import main from './main'
import shared from './shared'
import social from './social'
import store from './store'
import tools from './tools'
import windows from './windows'

export const EN_DICTS = { addons, core, main, shared, social, store, tools, windows }

for (const d of Object.values(EN_DICTS)) registerEn(d)
