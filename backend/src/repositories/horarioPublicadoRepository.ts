import { prisma } from '../config/prisma.js';
import type { Prisma } from '@prisma/client';
import { ROLES } from '../constants/roles.js';

export interface HorarioScope { carreraId?: number | null; cursoAnio?: number | null }
export const ambitoClave = (scope: HorarioScope): string => scope.carreraId == null
  ? 'GENERAL'
  : scope.cursoAnio == null ? `CARRERA:${scope.carreraId}` : `CARRERA:${scope.carreraId}:ANIO:${scope.cursoAnio}`;
export interface DocumentoHorarioCreateData extends HorarioScope {
  cicloLectivo: number; titulo: string; nombreOriginal: string; claveInterna: string;
  tamanio: number; sha256: string; publicadorId: number;
}

const includeDocumento = {
  publicador: { select: { idUsuario: true, apellidoNombre: true } },
  carrera: { select: { id: true, nombre: true, duracionAnios: true } },
  publicacionVigente: true
} as const;

class HorarioPublicadoRepository {
  async listarAnios(): Promise<any[]> {
    return prisma.publicacionHorario.findMany({ select: { cicloLectivo: true, carreraId: true, cursoAnio: true, ambitoClave: true }, orderBy: { cicloLectivo: 'desc' } });
  }
  async listarCarrerasElegibles(cicloLectivo: number, usuario: { id: number; rol: string }) {
    const where: Prisma.CarreraWhereInput = { activo: true };
    if (usuario.rol === ROLES.ALUMNO) where.inscripciones = { some: { usuarioId: usuario.id, activo: true } };
    if (usuario.rol === ROLES.PROFESOR) where.materias = { some: { OR: [
      { profesorMaterias: { some: { profesorId: usuario.id, activo: true, fechaBaja: null } } },
      { cursadas: { some: { docenteId: usuario.id, activo: true, anioLectivo: cicloLectivo } } }
    ] } };
    return prisma.carrera.findMany({ where, select: { id: true, nombre: true, duracionAnios: true }, orderBy: { nombre: 'asc' } });
  }
  async carreraElegible(cicloLectivo: number, carreraId: number, usuario: { id: number; rol: string }) {
    return (await this.listarCarrerasElegibles(cicloLectivo, usuario)).some(carrera => carrera.id === carreraId);
  }
  async buscarCarrera(carreraId: number) {
    return prisma.carrera.findUnique({ where: { id: carreraId }, select: { id: true, nombre: true, duracionAnios: true, activo: true } });
  }
  async buscarVigentePorAmbito(cicloLectivo: number, scope: HorarioScope): Promise<any> {
    return prisma.publicacionHorario.findUnique({ where: { cicloLectivo_ambitoClave: { cicloLectivo, ambitoClave: ambitoClave(scope) } }, include: { documento: { include: includeDocumento } } });
  }
  async buscarUltimaVigentePorAmbito(scope: HorarioScope): Promise<any> {
    return prisma.publicacionHorario.findFirst({ where: { ambitoClave: ambitoClave(scope) }, orderBy: { cicloLectivo: 'desc' }, include: { documento: { include: includeDocumento } } });
  }
  async buscarPorId(id: number): Promise<any> { return prisma.documentoHorario.findUnique({ where: { id }, include: includeDocumento }); }
  async buscarPorCicloYHash(cicloLectivo: number, sha256: string, scope: HorarioScope = {}): Promise<any> {
    return prisma.documentoHorario.findUnique({ where: { cicloLectivo_ambitoClave_sha256: { cicloLectivo, ambitoClave: ambitoClave(scope), sha256 } }, include: includeDocumento });
  }
  async listarHistorial(cicloLectivo: number, scope: HorarioScope = {}): Promise<any[]> {
    return prisma.documentoHorario.findMany({ where: { cicloLectivo, ambitoClave: ambitoClave(scope) }, include: includeDocumento, orderBy: { createdAt: 'desc' } });
  }
  async crearYPublicar(data: DocumentoHorarioCreateData): Promise<any> {
    return prisma.$transaction(async tx => {
      const clave = ambitoClave(data);
      const documento = await tx.documentoHorario.create({ data: { ...data, ambitoClave: clave } });
      await tx.publicacionHorario.upsert({
        where: { cicloLectivo_ambitoClave: { cicloLectivo: data.cicloLectivo, ambitoClave: clave } },
        create: { cicloLectivo: data.cicloLectivo, ambitoClave: clave, carreraId: data.carreraId ?? null, cursoAnio: data.cursoAnio ?? null, documentoId: documento.id },
        update: { documentoId: documento.id }
      });
      return tx.documentoHorario.findUnique({ where: { id: documento.id }, include: includeDocumento });
    });
  }
  async publicarExistente(documento: { id: number; cicloLectivo: number; carreraId?: number | null; cursoAnio?: number | null }): Promise<void> {
    await prisma.$transaction(async tx => {
      const clave = ambitoClave(documento);
      await tx.publicacionHorario.upsert({
        where: { cicloLectivo_ambitoClave: { cicloLectivo: documento.cicloLectivo, ambitoClave: clave } },
        create: { cicloLectivo: documento.cicloLectivo, ambitoClave: clave, carreraId: documento.carreraId ?? null, cursoAnio: documento.cursoAnio ?? null, documentoId: documento.id },
        update: { documentoId: documento.id }
      });
    });
  }
}
export default new HorarioPublicadoRepository();
