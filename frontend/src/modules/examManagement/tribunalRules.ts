import type { TribunalMember, TribunalRole } from './types/exams'

const VALID_ROLES: TribunalRole[] = ['PRESIDENTE', 'VOCAL', 'SUPLENTE']

export function isTribunalComplete(members: TribunalMember[]): boolean {
  if (new Set(members.map((member) => member.profesorId)).size !== members.length) return false
  if (members.some((member) => !Number.isInteger(member.profesorId) || !VALID_ROLES.includes(member.rolTribunal))) return false

  return members.filter((member) => member.rolTribunal === 'PRESIDENTE').length === 1
    && members.filter((member) => member.rolTribunal === 'VOCAL').length === 2
    && members.filter((member) => member.rolTribunal === 'SUPLENTE').length <= 1
    && members.length >= 3
    && members.length <= 4
}
