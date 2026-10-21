import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import materiaRepository from '../repositories/materiaRepository.js';
import estadoAcademicoService from './estadoAcademicoService.js';
import { AppError } from '../utils/AppError.js';
import { createsMixedCorrelationCycle, espacioNode, materiaNode } from '../utils/correlatividadGraph.js';

type SpaceInput = { nombre: string; carreraId: number; descripcion?: string | null; componentesIds: number[]; correlatividades?: RequirementInput[]; revisarCorrelatividadesComponentes?: boolean };
type SpacePatch = { nombre?: string; descripcion?: string | null; componentesIds?: number[]; revisarCorrelatividadesComponentes?: boolean };
type RequirementInput = { materiaRequeridaId?: number; espacioRequeridoId?: number; aplicaCursado: boolean; aplicaRendir: boolean };
type Db = Prisma.TransactionClient;

const spaceInclude = {
  carrera: { select: { id: true, nombre: true } },
  materias: { select: { id: true, nombre: true }, orderBy: { nombre: 'asc' as const } }
};

class EspacioCurricularService {
  async list() {
    return prisma.espacioCurricular.findMany({ include: spaceInclude, orderBy: { nombre: 'asc' } });
  }

  async get(id: number) {
    const space = await prisma.espacioCurricular.findUnique({ where: { id }, include: spaceInclude });
    if (!space) throw new AppError(404, 'Espacio curricular no encontrado');
    return space;
  }

  private async requireCareer(db: Db, carreraId: number) {
    const career = await db.carrera.findUnique({ where: { id: carreraId }, select: { id: true, activo: true } });
    if (!career || !career.activo) throw new AppError(400, 'La carrera no existe o está inactiva');
    return career;
  }

  private async lockCareer(db: Db, carreraId: number): Promise<void> {
    await db.$queryRaw`SELECT id FROM carreras WHERE id = ${carreraId} FOR UPDATE`;
    await this.requireCareer(db, carreraId);
  }

  private async requireSpace(db: Db, id: number) {
    const space = await db.espacioCurricular.findUnique({ where: { id }, include: { materias: { select: { id: true } } } });
    if (!space) throw new AppError(404, 'Espacio curricular no encontrado');
    if (!space.carreraId) throw new AppError(409, 'El espacio curricular no tiene una carrera asignada');
    return space;
  }

  private async validateComponents(db: Db, carreraId: number, ids: number[], spaceId?: number): Promise<void> {
    if (new Set(ids).size !== ids.length) {
      throw new AppError(400, 'Seleccioná materias distintas');
    }
    const components = await db.materia.findMany({
      where: { id: { in: ids }, carreraId, activo: true },
      select: { id: true, espacioCurricularId: true }
    });
    if (components.length !== ids.length) throw new AppError(400, 'Todas las materias deben estar activas y pertenecer a la carrera');
    if (components.some((materia) => materia.espacioCurricularId !== null && materia.espacioCurricularId !== spaceId)) {
      throw new AppError(409, 'Una materia ya pertenece a otro espacio curricular');
    }
  }

  private async groupAlreadyCompleted(db: Db, componentIds: number[]): Promise<boolean> {
    if (componentIds.length < 2) return false;
    const [exams, homologations, grades] = await Promise.all([
      db.inscripcionExamen.findMany({
        where: { aprobado: true, fechaBaja: null, mesa: { materiaId: { in: componentIds } } },
        select: { alumnoId: true }
      }),
      db.homologacion.findMany({
        where: { estado: 'APROBADA', calificacion: { not: null }, materiaId: { in: componentIds } },
        select: { alumnoId: true }
      }),
      db.calificacion.findMany({
        where: { cursada: { materiaId: { in: componentIds } } },
        select: { alumnoId: true }
      })
    ]);
    const candidates = new Set([...exams, ...homologations, ...grades].map((row) => row.alumnoId));
    for (const alumnoId of candidates) {
      const approved = await estadoAcademicoService.getMateriasAprobadasSet(alumnoId);
      const completed = componentIds.every((materiaId) => approved.has(materiaId));
      if (completed) return true;
    }
    return false;
  }

  private async replaceComponents(db: Db, spaceId: number, carreraId: number, ids: number[]): Promise<void> {
    await db.materia.updateMany({
      where: { espacioCurricularId: spaceId, id: { notIn: ids } }, data: { espacioCurricularId: null }
    });
    await db.materia.updateMany({ where: { id: { in: ids }, carreraId }, data: { espacioCurricularId: spaceId } });
  }

  private async validateMembershipGraph(
    db: Db,
    carreraId: number,
    spaceId: number,
    currentIds: number[],
    nextIds: number[],
    suspendedRuleOrigins: number[]
  ): Promise<void> {
    const existing = await materiaRepository.getMixedCorrelationEdges(carreraId, db);
    const nextSet = new Set(nextIds);
    const currentSet = new Set(currentIds);
    const removedMemberships = new Set(currentIds.filter(id => !nextSet.has(id)).map(materiaNode));
    const suspendedOrigins = new Set(suspendedRuleOrigins.map(materiaNode));
    const proposedBase = existing.filter(edge => {
      if (edge.kind === 'MEMBERSHIP' && edge.to === espacioNode(spaceId) && removedMemberships.has(edge.from)) return false;
      if (edge.kind === 'LEGACY' && suspendedOrigins.has(edge.from)) return false;
      return true;
    });
    const additions = nextIds.filter(id => !currentSet.has(id)).map(id => ({
      from: materiaNode(id), to: espacioNode(spaceId), kind: 'MEMBERSHIP' as const,
      aplicaCursado: true, aplicaRendir: true
    }));
    if (createsMixedCorrelationCycle(proposedBase, additions)) {
      throw new AppError(400, 'La composición generaría un ciclo con las correlatividades existentes');
    }
  }

  async create(input: SpaceInput) {
    return materiaRepository.withTransaction(async (tx) => {
      await this.lockCareer(tx, input.carreraId);
      await this.validateComponents(tx, input.carreraId, input.componentesIds);
      const componentRules = await tx.correlatividad.findMany({
        where: { materiaOrigenId: { in: input.componentesIds }, tipoRequisito: 'OBLIGATORIA', suspendidaPorEspacio: false },
        select: { id: true, materiaOrigenId: true, materiaRequeridaId: true, aplicaCursado: true, aplicaRendir: true }
      });
      if (componentRules.length && input.revisarCorrelatividadesComponentes !== true) {
        throw new AppError(400, 'Revisá y confirmá las correlatividades propias de las materias antes de agruparlas');
      }
      const space = await tx.espacioCurricular.create({
        data: { nombre: input.nombre.trim(), descripcion: input.descripcion ?? null, carreraId: input.carreraId, activo: false },
        select: { id: true }
      });
      await this.replaceComponents(tx, space.id, input.carreraId, input.componentesIds);
      for (const prerequisite of input.correlatividades ?? []) {
        await this.createPrerequisite(tx, space.id, input.carreraId, input.componentesIds, prerequisite);
      }
      if (componentRules.length) {
        await tx.correlatividad.updateMany({
          where: { id: { in: componentRules.map(rule => rule.id) }, suspendidaPorEspacio: false },
          data: { suspendidaPorEspacio: true }
        });
      }
      return tx.espacioCurricular.findUnique({ where: { id: space.id }, include: spaceInclude });
    });
  }

  private async createPrerequisite(tx: Db, id: number, carreraId: number, componentIds: number[], input: RequirementInput) {
    let targetNode: string;
    if (input.materiaRequeridaId !== undefined) {
      if (componentIds.includes(input.materiaRequeridaId)) throw new AppError(400, 'Una materia del espacio no puede ser su propia correlativa');
      const materia = await tx.materia.findUnique({ where: { id: input.materiaRequeridaId }, select: { carreraId: true } });
      if (!materia || materia.carreraId !== carreraId) throw new AppError(400, 'La materia requerida debe pertenecer a la misma carrera');
      targetNode = materiaNode(input.materiaRequeridaId);
    } else {
      const requiredSpaceId = input.espacioRequeridoId!;
      if (requiredSpaceId === id) throw new AppError(400, 'Un espacio no puede ser su propia correlativa');
      const requiredSpace = await tx.espacioCurricular.findUnique({ where: { id: requiredSpaceId }, select: { carreraId: true, materias: { select: { id: true } } } });
      if (!requiredSpace || requiredSpace.carreraId !== carreraId) throw new AppError(400, 'El espacio requerido debe pertenecer a la misma carrera');
      if (requiredSpace.materias.some(materia => componentIds.includes(materia.id))) throw new AppError(400, 'El espacio requerido contiene materias del espacio actual');
      targetNode = espacioNode(requiredSpaceId);
    }

    const duplicate = await tx.espacioCorrelatividad.findFirst({
      where: { espacioOrigenId: id, ...(input.materiaRequeridaId !== undefined ? { materiaRequeridaId: input.materiaRequeridaId } : { espacioRequeridoId: input.espacioRequeridoId }) },
      select: { id: true }
    });
    if (duplicate) throw new AppError(409, 'La correlatividad ya existe');

    const edges = await materiaRepository.getMixedCorrelationEdges(carreraId, tx);
    const componentNodes = new Set(componentIds.map(materiaNode));
    const activeEdges = edges.filter(edge => !(edge.kind === 'LEGACY' && componentNodes.has(edge.from)));
    const addition = {
      from: espacioNode(id), to: targetNode, kind: 'SPACE' as const,
      aplicaCursado: input.aplicaCursado, aplicaRendir: input.aplicaRendir
    };
    if (createsMixedCorrelationCycle(activeEdges, [addition])) throw new AppError(400, 'La correlatividad generaría un ciclo');

    return tx.espacioCorrelatividad.create({ data: {
      espacioOrigenId: id,
      materiaRequeridaId: input.materiaRequeridaId ?? null,
      espacioRequeridoId: input.espacioRequeridoId ?? null,
      aplicaCursado: input.aplicaCursado,
      aplicaRendir: input.aplicaRendir
    }, include: { materiaRequerida: { select: { id: true, nombre: true } }, espacioRequerido: { select: { id: true, nombre: true } } } });
  }

  async update(id: number, input: SpacePatch) {
    if (input.componentesIds === undefined) {
      if (input.revisarCorrelatividadesComponentes !== undefined) throw new AppError(400, 'La revisión aplica únicamente al cambiar la composición');
      await this.get(id);
      return prisma.espacioCurricular.update({ where: { id }, data: {
        ...(input.nombre !== undefined ? { nombre: input.nombre.trim() } : {}),
        ...(input.descripcion !== undefined ? { descripcion: input.descripcion } : {})
      }, include: spaceInclude });
    }

    const result = await materiaRepository.withTransaction(async (tx) => {
      const current = await this.requireSpace(tx, id);
      await this.lockCareer(tx, current.carreraId!);
      const locked = await this.requireSpace(tx, id);
      if (locked.composicionBloqueadaAt) return { blocked: true as const };
      const currentIds = locked.materias.map((materia) => materia.id);
      if (await this.groupAlreadyCompleted(tx, currentIds)) {
        await tx.espacioCurricular.update({ where: { id }, data: { composicionBloqueadaAt: new Date() } });
        return { blocked: true as const };
      }
      const nextIds = input.componentesIds!;
      const compositionChanged = currentIds.length !== nextIds.length || currentIds.some(componentId => !nextIds.includes(componentId));
      if (compositionChanged) {
        const [activeOfferings, enrollments] = await Promise.all([
          tx.cursadaEspacio.count({ where: { espacioCurricularId: id, activo: true } }),
          tx.inscripcionEspacio.count({ where: { cursadaEspacio: { espacioCurricularId: id } } })
        ]);
        if (activeOfferings || enrollments) {
          throw new AppError(409, 'No se puede cambiar la composición: el espacio tiene ofertas activas o matrículas registradas');
        }
      }
      await this.validateComponents(tx, locked.carreraId!, nextIds, id);
      const componentRules = compositionChanged ? await tx.correlatividad.findMany({
        where: { materiaOrigenId: { in: [...new Set([...currentIds, ...nextIds])] }, tipoRequisito: 'OBLIGATORIA', suspendidaPorEspacio: false },
        select: { id: true }
      }) : [];
      if (componentRules.length && input.revisarCorrelatividadesComponentes !== true) {
        throw new AppError(400, 'Revisá y confirmá las correlatividades propias de las materias antes de cambiar la composición');
      }
      if (compositionChanged) {
        await this.validateMembershipGraph(
          tx,
          locked.carreraId!,
          id,
          currentIds,
          nextIds,
          componentRules.length && input.revisarCorrelatividadesComponentes === true
            ? [...new Set([...currentIds, ...nextIds])]
            : []
        );
      }
      await this.replaceComponents(tx, id, locked.carreraId!, nextIds);
      if (componentRules.length) {
        await tx.correlatividad.updateMany({
          where: { id: { in: componentRules.map(rule => rule.id) }, suspendidaPorEspacio: false },
          data: { suspendidaPorEspacio: true }
        });
      }
      const data = {
        ...(input.nombre !== undefined ? { nombre: input.nombre.trim() } : {}),
        ...(input.descripcion !== undefined ? { descripcion: input.descripcion } : {}),
        ...(nextIds.length < 2 ? { activo: false } : {}),
        ...(await this.groupAlreadyCompleted(tx, nextIds) ? { composicionBloqueadaAt: new Date() } : {})
      };
      const updated = await tx.espacioCurricular.update({ where: { id }, data, include: spaceInclude });
      return { blocked: false as const, updated };
    });
    if (result.blocked) throw new AppError(409, 'La composición quedó bloqueada porque el espacio ya fue completado');
    return result.updated;
  }

  async activate(id: number) {
    return materiaRepository.withTransaction(async (tx) => {
      const current = await this.requireSpace(tx, id);
      await this.lockCareer(tx, current.carreraId!);
      const locked = await this.requireSpace(tx, id);
      if (locked.materias.length < 2) throw new AppError(400, 'Se requieren al menos dos materias para activar el espacio');
      const completed = locked.composicionBloqueadaAt
        ? false
        : await this.groupAlreadyCompleted(tx, locked.materias.map((materia) => materia.id));
      return tx.espacioCurricular.update({
        where: { id },
        data: { activo: true, ...(completed ? { composicionBloqueadaAt: new Date() } : {}) },
        include: spaceInclude
      });
    });
  }

  async listPrerequisites(id: number) {
    await this.get(id);
    return prisma.espacioCorrelatividad.findMany({
      where: { espacioOrigenId: id },
      include: { materiaRequerida: { select: { id: true, nombre: true } }, espacioRequerido: { select: { id: true, nombre: true } } },
      orderBy: { id: 'asc' }
    });
  }

  async addPrerequisite(id: number, input: RequirementInput) {
    return materiaRepository.withTransaction(async tx => {
      const source = await this.requireSpace(tx, id);
      const carreraId = source.carreraId!;
      await this.lockCareer(tx, carreraId);
      const lockedSource = await this.requireSpace(tx, id);
      const componentIds = lockedSource.materias.map(materia => materia.id);
      return this.createPrerequisite(tx, id, carreraId, componentIds, input);
    });
  }

  async removePrerequisite(id: number, correlatividadId: number): Promise<void> {
    await materiaRepository.withTransaction(async tx => {
      const source = await this.requireSpace(tx, id);
      await this.lockCareer(tx, source.carreraId!);
      await this.requireSpace(tx, id);
      const result = await tx.espacioCorrelatividad.deleteMany({ where: { id: correlatividadId, espacioOrigenId: id } });
      if (!result.count) throw new AppError(404, 'Correlatividad no encontrada');
    });
  }

  async latchIfCompleted(db: Db, id: number): Promise<boolean> {
    const space = await this.requireSpace(db, id);
    if (space.composicionBloqueadaAt) return true;
    const componentIds = space.materias.map(materia => materia.id);
    if (!(await this.groupAlreadyCompleted(db, componentIds))) return false;
    await db.espacioCurricular.updateMany({
      where: { id, composicionBloqueadaAt: null }, data: { composicionBloqueadaAt: new Date() }
    });
    return true;
  }
}

export default new EspacioCurricularService();
