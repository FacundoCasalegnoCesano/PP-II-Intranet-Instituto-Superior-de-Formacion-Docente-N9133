export const ROLES = {
  ALUMNO: 'ALUMNO',
  PROFESOR: 'PROFESOR',
  ADMINISTRATIVO: 'ADMINISTRATIVO'
} as const;

export type Rol = typeof ROLES[keyof typeof ROLES];

export const ROLES_LIST: Rol[] = ['ALUMNO', 'PROFESOR', 'ADMINISTRATIVO'];

export const ROLE_LABELS: Record<Rol, string> = {
  [ROLES.ALUMNO]: 'Alumno',
  [ROLES.PROFESOR]: 'Profesor',
  [ROLES.ADMINISTRATIVO]: 'Administrativo'
};

export const ROLE_HIERARCHY: Record<Rol, Rol[]> = {
  [ROLES.ALUMNO]: [ROLES.ALUMNO],
  [ROLES.PROFESOR]: [ROLES.ALUMNO, ROLES.PROFESOR],
  [ROLES.ADMINISTRATIVO]: [ROLES.ALUMNO, ROLES.PROFESOR, ROLES.ADMINISTRATIVO]
};