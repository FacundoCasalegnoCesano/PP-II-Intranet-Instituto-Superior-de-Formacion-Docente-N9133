import { prisma } from '../config/prisma.js';
import { ROLES } from '../constants/roles.js';
import { evaluarRequisitosAcademicos, type RequisitoAcademico, type RequisitoAcademicoPendiente } from '../domain/academico/correlatividadesEspacios.js';
import estadoAcademicoService from './estadoAcademicoService.js';
import { AppError } from '../utils/AppError.js';
import { anioInstitucionalActual } from '../utils/cicloLectivo.js';
import { getAlumnoIdByUsuarioId } from '../utils/alumnoHelper.js';

type Motivo = { tipo: 'CORRELATIVIDAD' | 'PERIODO' | 'YA_INSCRIPTO' | 'CICLO' | 'COMPOSICION' | 'CARRERA' | 'HISTORIAL'; codigo: string; mensaje: string; referenciaId?: number };

const ofertaInclude = {
  espacioCurricular: { include: { carrera: { select: { id: true, nombre: true } }, materias: { select: { id: true } } } },
  componentes: { include: {
    materia: { include: { carrera: { select: { id: true, nombre: true } } } },
    docente: { select: { idUsuario: true, apellidoNombre: true, email: true } }
  }, orderBy: [{ materia: { nombre: 'asc' as const } }, { id: 'asc' as const }] }
};

function requireRole(user: any, ...roles: string[]) {
  if (!roles.includes(user?.rol)) throw new AppError(403, 'No tienes permisos para esta inscripción');
}

function mapUnique(error: unknown): never {
  if ((error as any)?.code === 'P2002') throw new AppError(409, 'La matrícula del espacio ya existe o cambió durante la inscripción');
  throw error;
}

function getSpaceRules(rules: any[]): RequisitoAcademico[] {
  return rules.flatMap<RequisitoAcademico>((rule) => rule.materiaRequerida
    ? [{ tipo: 'MATERIA', requisitoId: rule.id, nombre: rule.materiaRequerida.nombre, materiaId: rule.materiaRequerida.id }]
    : rule.espacioRequerido ? [{ tipo: 'ESPACIO', requisitoId: rule.id, nombre: rule.espacioRequerido.nombre, espacioId: rule.espacioRequerido.id, componentesIds: rule.espacioRequerido.materias.map((item: any) => item.id) }] : []);
}

class InscripcionEspacioService {
  private async loadStudent(usuarioId: number) {
    const user = await prisma.usuario.findUnique({ where: { idUsuario: usuarioId }, select: { idUsuario: true, rol: true, activo: true } });
    if (!user || !user.activo || !(user.rol ?? '').split(',').map((rol) => rol.trim()).includes(ROLES.ALUMNO)) {
      throw new AppError(404, 'Alumno no encontrado o inactivo');
    }
    return { usuarioId, alumnoId: await getAlumnoIdByUsuarioId(usuarioId) };
  }

  private async academicFacts(alumnoId: number, spaceId: number, componentIds: number[]) {
    const [states, approved, rules] = await Promise.all([
      estadoAcademicoService.getMapaEstadosPorMateria(alumnoId),
      estadoAcademicoService.getMateriasAprobadasSet(alumnoId),
      prisma.espacioCorrelatividad.findMany({
        where: { espacioOrigenId: spaceId, aplicaCursado: true },
        include: {
          materiaRequerida: { select: { id: true, nombre: true } },
          espacioRequerido: { select: { id: true, nombre: true, materias: { select: { id: true } } } }
        }, orderBy: { id: 'asc' }
      })
    ]);
    const fulfilled = new Set(approved);
    for (const [materiaId, state] of states) {
      if (estadoAcademicoService.esRegularizado(state)) fulfilled.add(materiaId);
    }
    const correlatividades = evaluarRequisitosAcademicos({ modo: 'CURSAR', reglas: getSpaceRules(rules), materiasCumplidas: fulfilled });
    return {
      states,
      approved,
      correlatividades,
      pendientes: correlatividades.pendientes as RequisitoAcademicoPendiente[],
      completado: componentIds.length >= 2 && componentIds.every((id) => approved.has(id))
    };
  }

  private async getActiveCareerIds(usuarioId: number): Promise<number[]> {
    const rows = await prisma.inscripcionCarrera.findMany({ where: { usuarioId, activo: true }, select: { carreraId: true } });
    return rows.map((row) => row.carreraId);
  }

  private async compatibleChildren(alumnoId: number, offer: any, parentId?: number) {
    const registrations = await prisma.inscripcionMateria.findMany({
      where: { alumnoId, cicloLectivo: offer.anioLectivo, materiaId: { in: offer.componentes.map((course: any) => course.materiaId) } },
      select: { id: true, materiaId: true, cicloLectivo: true, cursadaId: true, estado: true, fechaBaja: true, modalidadElegida: true, inscripcionEspacioId: true }
    });
    const byMatter = new Map(registrations.map((row) => [row.materiaId, row]));
    const components = offer.componentes.map((course: any) => ({ course, registration: byMatter.get(course.materiaId) ?? null }));
    const incompatible = components.find(({ course, registration }: any) => registration && (
      registration.cursadaId !== course.id
      || (registration.inscripcionEspacioId !== null && registration.inscripcionEspacioId !== undefined && registration.inscripcionEspacioId !== parentId)
    ));
    return { components, incompatible };
  }

  private async offerForStudent(cursadaEspacioId: number, student: { usuarioId: number; alumnoId: number }) {
    const offer = await prisma.cursadaEspacio.findUnique({ where: { id: cursadaEspacioId }, include: ofertaInclude });
    if (!offer || !offer.activo || !offer.espacioCurricular.activo) throw new AppError(404, 'Cursada de espacio no disponible');
    const catalogIds = offer.espacioCurricular.materias.map((item: any) => item.id).sort((a: number, b: number) => a - b);
    const componentIds = offer.componentes.map((item: any) => item.materiaId).sort((a: number, b: number) => a - b);
    const staleComposition = componentIds.length < 2 || componentIds.length !== catalogIds.length || componentIds.some((id: number, index: number) => id !== catalogIds[index])
      || offer.componentes.some((item: any) => !item.activo);
    const careerIds = await this.getActiveCareerIds(student.usuarioId);
    const hasCareer = offer.espacioCurricular.carreraId !== null
      && careerIds.includes(offer.espacioCurricular.carreraId);
    const [habilitada, parent, academic] = await Promise.all([
      !staleComposition && hasCareer ? prisma.periodoEspacioHabilitado.count({ where: {
        cursadaEspacioId,
        periodoInscripcion: { tipo: 'MATERIA', activo: true, fechaInicio: { lte: new Date() }, fechaFin: { gte: new Date() }, cicloLectivo: offer.anioLectivo }
      } }).then((count) => count > 0) : Promise.resolve(false),
      prisma.inscripcionEspacio.findUnique({ where: { alumnoId_cursadaEspacioId: { alumnoId: student.alumnoId, cursadaEspacioId } }, select: { id: true, estado: true } }),
      this.academicFacts(student.alumnoId, offer.espacioCurricularId, componentIds)
    ]);
    const enrolled = parent && ['ACTIVA', 'RECURSANDO'].includes(parent.estado) ? parent : null;
    const children = await this.compatibleChildren(student.alumnoId, offer, parent?.id);
    const motivos: Motivo[] = [];
    if (!hasCareer) motivos.push({ tipo: 'CARRERA', codigo: 'CARRERA_NO_INSCRIPTA', mensaje: 'El alumno no está inscripto a la carrera de este espacio' });
    if (staleComposition) motivos.push({ tipo: 'COMPOSICION', codigo: 'OFERTA_DESACTUALIZADA', mensaje: 'La oferta ya no coincide con la composición actual del espacio' });
    if (!habilitada) motivos.push({ tipo: 'PERIODO', codigo: 'PERIODO_CERRADO', mensaje: 'Esta cursada no está habilitada en un período de inscripción vigente' });
    if (enrolled) motivos.push({ tipo: 'YA_INSCRIPTO', codigo: 'YA_INSCRIPTO', mensaje: 'El alumno ya está inscripto a este espacio' });
    if (!academic.correlatividades.cumple) motivos.push(...academic.pendientes.map((pending) => ({
      tipo: 'CORRELATIVIDAD' as const, codigo: 'CORRELATIVIDAD_PENDIENTE', mensaje: `Falta cumplir ${pending.nombre}`, referenciaId: pending.requisitoId
    })));
    if (children.incompatible) motivos.push({ tipo: 'HISTORIAL', codigo: 'REGISTRO_COMPONENTE_INCOMPATIBLE', mensaje: `La materia ${(children.incompatible as any).course.materia.nombre} ya tiene una inscripción en otra cursada` });
    if (academic.completado) motivos.push({ tipo: 'YA_INSCRIPTO', codigo: 'ESPACIO_APROBADO', mensaje: 'El alumno ya aprobó todos los componentes de este espacio' });
    return {
      cursadaEspacioId: offer.id,
      espacioCurricular: { id: offer.espacioCurricular.id, nombre: offer.espacioCurricular.nombre, carreraId: offer.espacioCurricular.carreraId, carrera: offer.espacioCurricular.carrera },
      anioLectivo: offer.anioLectivo,
      periodo: offer.periodo,
      componentes: offer.componentes.map((course: any) => ({
        cursadaId: course.id, materia: course.materia, docente: course.docente,
        estadoAcademico: academic.states.get(course.materiaId) ?? 'PENDIENTE',
        yaCursada: children.components.find(({ course: current }: any) => current.id === course.id)?.registration !== null
      })),
      habilitada,
      yaInscripto: Boolean(enrolled),
      aprobado: academic.completado,
      motivos,
      pendientes: academic.pendientes,
      _offer: offer
    };
  }

  async disponibles(usuarioId: number, cicloLectivo: number) {
    const student = await this.loadStudent(usuarioId);
    const careerIds = await this.getActiveCareerIds(usuarioId);
    if (careerIds.length === 0) throw new AppError(409, 'El alumno no está inscripto en ninguna carrera');
    const offers = await prisma.cursadaEspacio.findMany({
      where: { anioLectivo: cicloLectivo, activo: true, espacioCurricular: { activo: true, carreraId: { in: careerIds } } },
      select: { id: true }, orderBy: [{ espacioCurricular: { nombre: 'asc' } }, { id: 'asc' }]
    });
    const evaluated = await Promise.all(offers.map((offer) => this.offerForStudent(offer.id, student)));
    return evaluated.map(({ _offer: _private, ...dto }) => dto);
  }

  async verificar(cursadaEspacioId: number, usuarioId: number, currentUser?: any) {
    const student = await this.loadStudent(usuarioId);
    if (currentUser?.rol === ROLES.ALUMNO) {
      const offer = await prisma.cursadaEspacio.findUnique({ where: { id: cursadaEspacioId }, select: { anioLectivo: true } });
      if (offer && offer.anioLectivo < anioInstitucionalActual()) {
        throw new AppError(409, 'Las cursadas anteriores son de consulta histórica y no admiten autoinscripción');
      }
    }
    const { _offer: _private, ...dto } = await this.offerForStudent(cursadaEspacioId, student);
    return dto;
  }

  private matriculaInclude = {
    cursadaEspacio: { include: ofertaInclude },
    componentes: { include: { materia: true, cursada: { include: { docente: { select: { idUsuario: true, apellidoNombre: true, email: true } } } } }, orderBy: [{ materia: { nombre: 'asc' as const } }, { id: 'asc' as const }] }
  };

  private async presentarMatricula(row: any) {
    const academic = await this.academicFacts(row.alumnoId, row.cursadaEspacio.espacioCurricularId, row.componentes.map((item: any) => item.materiaId));
    return {
      id: row.id, cursadaEspacioId: row.cursadaEspacioId, fechaInscripcion: row.fechaInscripcion,
      fechaBaja: row.fechaBaja, estado: row.estado,
      espacioCurricular: {
        id: row.cursadaEspacio.espacioCurricular.id, nombre: row.cursadaEspacio.espacioCurricular.nombre,
        carreraId: row.cursadaEspacio.espacioCurricular.carreraId, carrera: row.cursadaEspacio.espacioCurricular.carrera
      },
      anioLectivo: row.cursadaEspacio.anioLectivo, periodo: row.cursadaEspacio.periodo,
      componentes: row.componentes.map((item: any) => ({
        idInscripcionMateria: item.id, cursadaId: item.cursadaId, materia: item.materia,
        docente: item.cursada?.docente ?? null, modalidadElegida: item.modalidadElegida,
        estadoAcademico: academic.states.get(item.materiaId) ?? 'PENDIENTE'
      }))
    };
  }

  async listar(usuarioId: number) {
    const student = await this.loadStudent(usuarioId);
    const rows = await prisma.inscripcionEspacio.findMany({
      where: { alumnoId: student.alumnoId }, include: this.matriculaInclude,
      orderBy: [{ fechaInscripcion: 'desc' }, { id: 'desc' }]
    });
    return Promise.all(rows.map((row) => this.presentarMatricula(row)));
  }

  async inscribir(cursadaEspacioId: number, modalidadElegida: string | undefined, requestedUsuarioId: number, currentUser: any) {
    requireRole(currentUser, ROLES.ALUMNO, ROLES.ADMINISTRATIVO);
    if (!Number.isInteger(requestedUsuarioId) || requestedUsuarioId < 1) throw new AppError(400, 'alumnoId debe ser Usuario.idUsuario válido');
    const usuarioId = currentUser.rol === ROLES.ADMINISTRATIVO ? requestedUsuarioId : currentUser.id;
    if (currentUser.rol !== ROLES.ADMINISTRATIVO && requestedUsuarioId !== currentUser.id) throw new AppError(403, 'No tienes permisos para inscribir a otro alumno');
    const student = await this.loadStudent(usuarioId);
    try {
      const resultId = await prisma.$transaction(async (tx) => {
        const initial = await tx.cursadaEspacio.findUnique({ where: { id: cursadaEspacioId }, select: { id: true, espacioCurricular: { select: { carreraId: true } } } });
        if (!initial) throw new AppError(404, 'Cursada de espacio no encontrada');
        await tx.$queryRaw`SELECT id FROM carreras WHERE id = ${initial.espacioCurricular.carreraId} FOR UPDATE`;
        const offer = await tx.cursadaEspacio.findUnique({ where: { id: cursadaEspacioId }, include: ofertaInclude });
        if (!offer || !offer.activo || !offer.espacioCurricular.activo) throw new AppError(409, 'La cursada del espacio no está activa');
        if (currentUser.rol === ROLES.ALUMNO && offer.anioLectivo < anioInstitucionalActual()) {
          throw new AppError(409, 'Las cursadas anteriores son de consulta histórica y no admiten autoinscripción');
        }
        const espacioCarreraId = offer.espacioCurricular.carreraId;
        if (espacioCarreraId === null) throw new AppError(409, 'El espacio ya no tiene una carrera asignada');
        const catalogIds = offer.espacioCurricular.materias.map((item: any) => item.id).sort((a: number, b: number) => a - b);
        const courseIds = offer.componentes.map((item: any) => item.materiaId).sort((a: number, b: number) => a - b);
        if (courseIds.length < 2 || courseIds.length !== catalogIds.length || courseIds.some((id: number, index: number) => id !== catalogIds[index]) || offer.componentes.some((item: any) => !item.activo)) {
          throw new AppError(409, 'La oferta no coincide con todos los componentes activos del espacio');
        }
        if (modalidadElegida && offer.componentes.some((course: any) => course.materia.modalidad !== modalidadElegida)) {
          throw new AppError(400, 'La modalidad elegida no está disponible para todas las materias de este espacio');
        }
        const career = await tx.inscripcionCarrera.findFirst({ where: { usuarioId, carreraId: espacioCarreraId, activo: true }, select: { id: true } });
        if (!career) throw new AppError(409, 'El alumno no está inscripto a la carrera del espacio');
        if (currentUser.rol === ROLES.ALUMNO) {
          const now = new Date();
          // Serialize the enrollment decision with administrative edits to the
          // period's enabled offers. The career lock serializes composition.
          await tx.$queryRaw`SELECT pi.id FROM periodos_inscripcion pi INNER JOIN periodos_espacios pe ON pe.periodo_inscripcion_id = pi.id WHERE pe.cursada_espacio_id = ${cursadaEspacioId} AND pi.tipo = 'MATERIA' FOR UPDATE`;
          const enabled = await tx.periodoEspacioHabilitado.count({ where: {
            cursadaEspacioId, cursadaEspacio: { activo: true, anioLectivo: offer.anioLectivo },
            periodoInscripcion: { tipo: 'MATERIA', activo: true, cicloLectivo: offer.anioLectivo, fechaInicio: { lte: now }, fechaFin: { gte: now } }
          } });
          if (!enabled) throw new AppError(409, 'La cursada del espacio no está habilitada en un período de inscripción vigente');
        }
        const existingParent = await tx.inscripcionEspacio.findUnique({ where: { alumnoId_cursadaEspacioId: { alumnoId: student.alumnoId, cursadaEspacioId } }, include: { componentes: true } });
        if (existingParent && ['ACTIVA', 'RECURSANDO'].includes(existingParent.estado)) throw new AppError(409, 'El alumno ya está inscripto a este espacio');
        if (existingParent?.estado === 'FINALIZADA') throw new AppError(409, 'El alumno ya completó este espacio');

        const existingChildren = await tx.inscripcionMateria.findMany({
          where: { alumnoId: student.alumnoId, cicloLectivo: offer.anioLectivo, materiaId: { in: offer.componentes.map((item: any) => item.materiaId) } },
          select: { id: true, materiaId: true, cursadaId: true, estado: true, inscripcionEspacioId: true, modalidadElegida: true }
        });
        const childByMatter = new Map(existingChildren.map((item) => [item.materiaId, item]));
        for (const course of offer.componentes) {
          const existing = childByMatter.get(course.materiaId);
          if (existing && (existing.cursadaId !== course.id || (existing.inscripcionEspacioId !== null && existing.inscripcionEspacioId !== existingParent?.id))) {
            throw new AppError(409, `La materia ${course.materia.nombre} ya tiene una inscripción incompatible; no se modificó ninguna inscripción`);
          }
          if (existing?.estado === 'FINALIZADA' && existing.inscripcionEspacioId !== existingParent?.id) {
            const approved = await estadoAcademicoService.getMateriasAprobadasSet(student.alumnoId);
            if (!approved.has(course.materiaId)) throw new AppError(409, `La materia ${course.materia.nombre} tiene una inscripción finalizada sin crédito aprobado; requiere revisión administrativa`);
          }
          if (existing && modalidadElegida && existing.modalidadElegida !== modalidadElegida) {
            throw new AppError(409, `La materia ${course.materia.nombre} ya tiene otra modalidad registrada; no se modificó ninguna inscripción`);
          }
        }

        const academic = await this.academicFacts(student.alumnoId, offer.espacioCurricularId, courseIds);
        if (academic.completado && !existingParent) throw new AppError(409, 'El alumno ya aprobó todos los componentes del espacio');
        if (!academic.correlatividades.cumple) {
          const missing = academic.pendientes.map((item) => item.nombre).join(', ');
          throw new AppError(409, `No se cumplen las correlatividades del espacio: ${missing}`);
        }

        const parent = existingParent
          ? await tx.inscripcionEspacio.update({ where: { id: existingParent.id }, data: {
              estado: academic.completado ? 'FINALIZADA' : 'ACTIVA',
              fechaBaja: null,
              ...(academic.completado ? {} : { fechaInscripcion: new Date() })
            } })
          : await tx.inscripcionEspacio.create({ data: { alumnoId: student.alumnoId, cursadaEspacioId, estado: 'ACTIVA', fechaInscripcion: new Date() } });
        for (const course of offer.componentes) {
          const existing = childByMatter.get(course.materiaId);
          if (existing) {
            const isApproved = academic.approved.has(course.materiaId);
            await tx.inscripcionMateria.update({ where: { id: existing.id }, data: {
              inscripcionEspacioId: parent.id,
              ...(existing.estado === 'BAJA' && isApproved ? { estado: 'FINALIZADA', fechaBaja: null } : {}),
              ...(existing.estado === 'BAJA' && !isApproved ? { estado: 'ACTIVA', fechaBaja: null, fechaInscripcion: new Date() } : {})
            } });
          } else {
            await tx.inscripcionMateria.create({ data: {
              alumnoId: student.alumnoId, materiaId: course.materiaId, cursadaId: course.id,
              cicloLectivo: offer.anioLectivo, inscripcionEspacioId: parent.id,
              modalidadElegida: (modalidadElegida ?? course.materia.modalidad ?? 'PRESENCIAL') as any,
              estado: 'ACTIVA', fechaInscripcion: new Date()
            } });
          }
        }
        return parent.id;
      });
      const matricula = await prisma.inscripcionEspacio.findUnique({ where: { id: resultId }, include: this.matriculaInclude });
      return this.presentarMatricula(matricula);
    } catch (error) { mapUnique(error); }
  }

  async darBaja(id: number, currentUser: any) {
    requireRole(currentUser, ROLES.ALUMNO, ROLES.ADMINISTRATIVO);
    const student = currentUser.rol === ROLES.ADMINISTRATIVO ? null : await this.loadStudent(currentUser.id);
    const resultId = await prisma.$transaction(async (tx) => {
      const row = await tx.inscripcionEspacio.findUnique({ where: { id }, include: { cursadaEspacio: { select: { espacioCurricular: { select: { carreraId: true } } } } } });
      if (!row) throw new AppError(404, 'Matrícula de espacio no encontrada');
      if (student && row.alumnoId !== student.alumnoId) throw new AppError(403, 'No tienes permisos para dar de baja esta matrícula');
      if (row.estado === 'FINALIZADA') throw new AppError(409, 'No se puede dar de baja un espacio ya aprobado');
      await tx.$queryRaw`SELECT id FROM carreras WHERE id = ${row.cursadaEspacio.espacioCurricular.carreraId} FOR UPDATE`;
      const now = new Date();
      const linked = await tx.inscripcionMateria.findMany({ where: { inscripcionEspacioId: id }, select: { id: true, materiaId: true, estado: true } });
      const approved = await estadoAcademicoService.getMateriasAprobadasSet(row.alumnoId);
      for (const child of linked) {
        if (approved.has(child.materiaId)) {
          if (child.estado !== 'FINALIZADA') await tx.inscripcionMateria.update({ where: { id: child.id }, data: { estado: 'FINALIZADA', fechaBaja: null } });
        } else if (['ACTIVA', 'RECURSANDO'].includes(child.estado)) {
          await tx.inscripcionMateria.update({ where: { id: child.id }, data: { estado: 'BAJA', fechaBaja: now } });
        }
      }
      await tx.inscripcionEspacio.update({ where: { id }, data: { estado: 'BAJA', fechaBaja: now } });
      return id;
    });
    const row = await prisma.inscripcionEspacio.findUnique({ where: { id: resultId }, include: this.matriculaInclude });
    return this.presentarMatricula(row);
  }
}

export default new InscripcionEspacioService();
