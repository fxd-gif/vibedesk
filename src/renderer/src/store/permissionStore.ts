// Offene Freigaben (Claude will etwas tun und fragt) – beantwortbar per Karte, Handy oder im Terminal.
import { create } from 'zustand'
import { api } from '../api'
import type { PermissionAsk, PermissionDecision } from '../../../shared/permissions'
import { retract } from './notifyStore'

export const usePermissions = create<{ list: PermissionAsk[] }>(() => ({ list: [] }))

export const answerPermission = (id: string, d: PermissionDecision): Promise<boolean> => api.permissions.answer(id, d)

let wired = false
export function wirePermissions(): void {
  if (wired) return
  wired = true
  const apply = (list: PermissionAsk[]): void => {
    usePermissions.setState({ list })
    // Die Freigabe-Karte ersetzt die allgemeine „wartet auf dich“-Karte derselben Session
    setTimeout(() => list.forEach((a) => retract(`waiting:${a.sessionId}`)), 300)
  }
  api.on.permissions(apply)
  void api.permissions.list().then(apply)
}
