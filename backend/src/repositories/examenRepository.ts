import { prisma } from '../config/prisma.js';
import { Prisma } from '@prisma/client';
import type { RolTribunal, TipoExamen } from '@prisma/client';
import { AppError } from '../utils/AppError.js';

export interface ExamenCreateData {
  materiaId: number;
  fecha: Date;
  tipoExamen: string;
  llamado: number;
  folioExamen?: string | null;
  libroExamen?: string | null;
}

export interface ExamenUpdateData {
  fecha?: Date;
  tipoExamen?: string;
  llamado?: number;
  folioExamen?: string | null;
  libroExamen?: string | null;
}

export interface ExamenActor {
  id: number;
  rol: string;
}

export interface TribunalCreateData {
  mesaId: number;
  profesorId: number;
  rolTribunal: string;
  expectedVersion?: number;
}

export interface ResultadoExamenData {
  nota: number | null;
  ausente: boolean;
  actorId?: number;
  expectedVersion?: number;
}

export interface MesaDisponibleParaAlumno {
  id: number;
  materiaId: number;
  fecha: Date;
  tipoExamen: TipoExamen;
  llamado: number;
  materia: {
    id: number;
    nombre: string;
    carrera: { id: number; nombre: string };
    correlatividadesOrigen: Array<{
      materiaRequeridaId: number;
      materiaRequerida: { id: number; nombre: string };
      aplicaCursado: boolean;
      aplicaRendir: boolean;
    }>;
    inscripciones: Array<{ id: number }>;
  };
  tribunales: Array<{
    profesorId: number;
    rolTribunal: RolTribunal;
    profesor: { apellidoNombre: string };
  }>;
  inscripciones: Array<{ id: number; fechaBaja: Date | null }>;
}

class ExamenRepository {
  private assertVersion(actual: number, expectedVersion?: number): void {
    if (expectedVersion !== undefined && actual !== expectedVersion) {
      throw new AppError(409, `La mesa fue modificada; versión actual ${actual}`);
    }
  }

  private assertTribunalCompleto(tribunales: Array<{ rolTribunal: string }>): void {
    const presidente = tribunales.filter(t => t.rolTribunal === 'PRESIDENTE').length;
    const vocales = tribunales.filter(t => t.rolTribunal === 'VOCAL').length;
    const suplentes = tribunales.filter(t => t.rolTribunal === 'SUPLENTE').length;
    if (presidente !== 1 || vocales !== 2 || suplentes > 1) {
      throw new AppError(409, 'El tribunal debe tener un presidente y dos vocales; el suplente es opcional');
    }
  }

  private assertActorPuedeEditarResultados(
    tribunales: Array<{ profesorId: number; rolTribunal: string }>,
    actor: ExamenActor,
    soloPresidente = false
  ): void {
    if (actor.rol === 'ADMINISTRATIVO') return;

    const cargo = tribunales.find(tribunal => tribunal.profesorId === actor.id);
    if (!cargo || (soloPresidente && cargo.rolTribunal !== 'PRESIDENTE')) {
      throw new AppError(
        403,
        soloPresidente
          ? 'Sólo el presidente actual del tribunal puede cerrar la mesa'
          : 'Sólo integrantes actuales del tribunal pueden registrar resultados'
      );
    }
  }

  private assertMutacionNominaPermitida(mesa: { estadoMesa: string; publicadaEn: Date | null }): void {
    if (mesa.estadoMesa !== 'ABIERTA' || mesa.publicadaEn !== null) {
      throw new AppError(409, 'La nómina sólo puede modificarse mientras la mesa está ABIERTA y sin publicación');
    }
  }

  private async lockMesa(tx: Prisma.TransactionClient, mesaId: number): Promise<void> {
    await tx.$queryRaw`SELECT id FROM mesas WHERE id = ${mesaId} FOR UPDATE`;
  }

  private async bumpMesaVersion(tx: Prisma.TransactionClient, mesaId: number): Promise<number> {
    const updated = await tx.mesa.update({
      where: { id: mesaId },
      data: { version: { increment: 1 } },
      select: { version: true }
    });
    return updated.version;
  }

  // ===== MESAS (EXÁMENES) =====
  async createExamen(data: ExamenCreateData): Promise<any> {
    return await prisma.mesa.create({
      data: {
        materiaId: data.materiaId,
        fecha: data.fecha,
        tipoExamen: data.tipoExamen as any,
        llamado: data.llamado,
        folioExamen: data.folioExamen ?? null,
        libroExamen: data.libroExamen ?? null,
        activo: true
      },
      include: {
        materia: {
          include: {
            carrera: true
          }
        }
      }
    });
  }

  async findExamenById(id: number, profesorId?: number): Promise<any> {
    return await prisma.mesa.findFirst({
      where: profesorId === undefined
        ? { id }
        : { id, tribunales: { some: { profesorId } } },
      include: {
        materia: {
          include: {
            carrera: true
          }
        },
        tribunales: {
          include: {
            profesor: {
              select: {
                idUsuario: true,
                apellidoNombre: true,
                email: true
              }
            }
          }
        },
        inscripciones: {
          include: {
            alumno: {
              include: {
                usuario: {
                  select: {
                    idUsuario: true,
                    apellidoNombre: true,
                    email: true,
                    dni: true
                  }
                }
              }
            }
          }
        }
      }
    });
  }

  async findAllExamenes(filters: any = {}) {
    const { materiaId, carreraId, fechaDesde, fechaHasta, cicloLectivo, estadoMesa, profesorId, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (materiaId) where.materiaId = materiaId;
    if (carreraId) where.materia = { ...(where.materia ?? {}), carreraId };
    if (estadoMesa) where.estadoMesa = estadoMesa;
    if (fechaDesde || fechaHasta) {
      where.fecha = {};
      if (fechaDesde) where.fecha.gte = new Date(fechaDesde);
      if (fechaHasta) where.fecha.lte = new Date(fechaHasta);
    }
    if (cicloLectivo) {
      where.fecha = {
        ...(where.fecha ?? {}),
        gte: where.fecha?.gte ?? new Date(`${Number(cicloLectivo)}-01-01T00:00:00-03:00`),
        lte: where.fecha?.lte ?? new Date(`${Number(cicloLectivo)}-12-31T23:59:59.999-03:00`)
      };
    }
    if (profesorId !== undefined) {
      where.tribunales = { some: { profesorId } };
    }

    const [examenes, total] = await Promise.all([
      prisma.mesa.findMany({
        where,
        skip,
        take: limit,
        orderBy: { fecha: 'desc' },
        include: {
          materia: {
            select: {
              id: true,
              nombre: true,
              carrera: { select: { id: true, nombre: true } }
            }
          },
          tribunales: {
            include: {
              profesor: {
                select: {
                  idUsuario: true,
                  apellidoNombre: true
                }
              }
            }
          },
          _count: {
            select: {
              inscripciones: true
            }
          }
        }
      }),
      prisma.mesa.count({ where })
    ]);

    return {
      data: examenes,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  }

  async findMesasDisponiblesParaAlumno(filtros: {
    usuarioId: number;
    alumnoId: number;
    cicloLectivo: number;
    evaluadoEn: Date;
    fechaDesde: Date;
  }): Promise<MesaDisponibleParaAlumno[]> {
    return await prisma.mesa.findMany({
      where: {
        activo: true,
        estadoMesa: 'ABIERTA',
        fecha: { gte: filtros.fechaDesde },
        periodosHabilitadores: {
          some: {
            periodoInscripcion: {
              tipo: 'EXAMEN',
              activo: true,
              fechaInicio: { lte: filtros.evaluadoEn },
              fechaFin: { gte: filtros.evaluadoEn }
            }
          }
        },
        materia: {
          carrera: {
            inscripciones: {
              some: {
                usuarioId: filtros.usuarioId,
                activo: true,
                fechaBaja: null
              }
            }
          }
        }
      },
      select: {
        id: true,
        version: true,
        materiaId: true,
        fecha: true,
        tipoExamen: true,
        llamado: true,
        materia: {
          select: {
            id: true,
            nombre: true,
            carrera: { select: { id: true, nombre: true } },
            correlatividadesOrigen: {
              where: { tipoRequisito: 'OBLIGATORIA' },
              select: {
                materiaRequeridaId: true,
                materiaRequerida: { select: { id: true, nombre: true } },
                aplicaCursado: true,
                aplicaRendir: true
              }
            },
            inscripciones: {
              where: {
                alumnoId: filtros.alumnoId,
                cicloLectivo: filtros.cicloLectivo,
                estado: { in: ['ACTIVA', 'RECURSANDO'] }
              },
              select: { id: true }
            }
          }
        },
        tribunales: {
          select: {
            profesorId: true,
            rolTribunal: true,
            profesor: { select: { apellidoNombre: true } }
          }
        },
        inscripciones: {
          where: { alumnoId: filtros.alumnoId },
          select: { id: true, fechaBaja: true }
        }
      },
      orderBy: [{ fecha: 'asc' }, { id: 'asc' }]
    });
  }

  async updateExamen(id: number, data: ExamenUpdateData, expectedVersion?: number): Promise<any> {
    const cleanData: any = { ...data };
    Object.keys(cleanData).forEach(key => {
      if (cleanData[key] === undefined) delete cleanData[key];
    });

    return await prisma.$transaction(async tx => {
      await this.lockMesa(tx, id);
      const mesa = await tx.mesa.findUnique({ where: { id } });
      if (!mesa) throw new AppError(404, 'Examen no encontrado');
      this.assertVersion(mesa.version, expectedVersion);
      if (mesa.estadoMesa === 'FINALIZADA') {
        throw new AppError(409, 'Una mesa finalizada no admite modificaciones');
      }
      const updated = await tx.mesa.update({
        where: { id },
        data: { ...cleanData, version: { increment: 1 } },
        include: { materia: true }
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async deleteExamen(id: number): Promise<any> {
    return await prisma.mesa.update({
      where: { id },
      data: { activo: false }
    });
  }

  // ===== TRIBUNALES =====
  async addTribunal(data: TribunalCreateData): Promise<any> {
    return await prisma.$transaction(async tx => {
      await this.lockMesa(tx, data.mesaId);
      const mesa = await tx.mesa.findUnique({
        where: { id: data.mesaId },
        include: { tribunales: true }
      });
      if (!mesa) throw new AppError(404, 'Examen no encontrado');
      this.assertVersion(mesa.version, data.expectedVersion);
      if (mesa.estadoMesa === 'FINALIZADA') {
        throw new AppError(409, 'Una mesa finalizada no admite cambios de tribunal');
      }
      if (mesa.tribunales.some(t => t.profesorId === data.profesorId)) {
        throw new AppError(409, 'El profesor ya integra el tribunal de esta mesa');
      }
      const sameRole = mesa.tribunales.filter(t => t.rolTribunal === data.rolTribunal).length;
      if ((data.rolTribunal === 'PRESIDENTE' && sameRole >= 1) ||
          (data.rolTribunal === 'VOCAL' && sameRole >= 2) ||
          (data.rolTribunal === 'SUPLENTE' && sameRole >= 1)) {
        throw new AppError(409, `La mesa ya tiene el máximo de cargos ${data.rolTribunal}`);
      }
      const tribunal = await tx.mesaTribunal.create({
        data: {
          mesaId: data.mesaId,
          profesorId: data.profesorId,
          rolTribunal: data.rolTribunal as any
        },
        include: {
          profesor: { select: { idUsuario: true, apellidoNombre: true, email: true } }
        }
      });
      const version = await this.bumpMesaVersion(tx, data.mesaId);
      return { ...tribunal, version };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async removeTribunal(id: number, expectedVersion?: number): Promise<any> {
    return await prisma.$transaction(async tx => {
      const tribunal = await tx.mesaTribunal.findUnique({ where: { id } });
      if (!tribunal) throw new AppError(404, 'Tribunal no encontrado');
      await this.lockMesa(tx, tribunal.mesaId);
      const mesa = await tx.mesa.findUnique({ where: { id: tribunal.mesaId } });
      if (!mesa) throw new AppError(404, 'Examen no encontrado');
      this.assertVersion(mesa.version, expectedVersion);
      if (mesa.estadoMesa === 'FINALIZADA') {
        throw new AppError(409, 'Una mesa finalizada no admite cambios de tribunal');
      }
      const deleted = await tx.mesaTribunal.delete({ where: { id } });
      const version = await this.bumpMesaVersion(tx, tribunal.mesaId);
      return { ...deleted, version };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async getTribunalesByExamen(mesaId: number): Promise<any[]> {
    return await prisma.mesaTribunal.findMany({
      where: { mesaId },
      include: {
        profesor: {
          select: {
            idUsuario: true,
            apellidoNombre: true,
            email: true
          }
        }
      }
    });
  }

  // ===== INSCRIPCIÓN A EXÁMENES =====
  async findInscripcionByMesaAndAlumno(mesaId: number, alumnoId: number): Promise<any> {
    return await prisma.inscripcionExamen.findFirst({
      where: { mesaId, alumnoId }
    });
  }

  async reactivarInscripcion(id: number, condicion: string, expectedVersion?: number): Promise<any> {
    return await prisma.$transaction(async tx => {
      const previous = await tx.inscripcionExamen.findUnique({ where: { id } });
      if (!previous) throw new AppError(404, 'Inscripción no encontrada');
      await this.lockMesa(tx, previous.mesaId);
      const mesa = await tx.mesa.findUnique({
        where: { id: previous.mesaId },
        include: { tribunales: true }
      });
      if (!mesa) throw new AppError(404, 'Examen no encontrado');
      this.assertVersion(mesa.version, expectedVersion);
      this.assertMutacionNominaPermitida(mesa);
      this.assertTribunalCompleto(mesa.tribunales);
      const updated = await tx.inscripcionExamen.update({
        where: { id },
        data: {
          condicion: condicion as any,
          fechaInscripcion: new Date(),
          fechaBaja: null,
          notaFinal: null,
          aprobado: false,
          notaBorrador: null,
          ausenteBorrador: false,
          ausentePublicado: false
        },
        include: {
          alumno: { include: { usuario: { select: { idUsuario: true, apellidoNombre: true, email: true, dni: true } } } },
          mesa: { include: { materia: true } }
        }
      });
      const version = await this.bumpMesaVersion(tx, previous.mesaId);
      return { ...updated, version };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async inscribirAlumno(mesaId: number, alumnoId: number, condicion: string, expectedVersion?: number): Promise<any> {
    return await prisma.$transaction(async tx => {
      await this.lockMesa(tx, mesaId);
      const mesa = await tx.mesa.findUnique({ where: { id: mesaId }, include: { tribunales: true } });
      if (!mesa) throw new AppError(404, 'Examen no encontrado');
      this.assertVersion(mesa.version, expectedVersion);
      this.assertMutacionNominaPermitida(mesa);
      this.assertTribunalCompleto(mesa.tribunales);
      const existing = await tx.inscripcionExamen.findFirst({ where: { mesaId, alumnoId } });
      if (existing?.fechaBaja === null) {
        throw new AppError(409, 'El alumno ya está inscripto a este examen');
      }
      const data = {
        condicion: condicion as any,
        fechaInscripcion: new Date(),
        fechaBaja: null,
        notaFinal: null,
        aprobado: false,
        notaBorrador: null,
        ausenteBorrador: false,
        ausentePublicado: false
      };
      const inscription = existing
        ? await tx.inscripcionExamen.update({ where: { id: existing.id }, data, include: { alumno: { include: { usuario: { select: { idUsuario: true, apellidoNombre: true, email: true, dni: true } } } }, mesa: { include: { materia: true } } } })
        : await tx.inscripcionExamen.create({ data: { mesaId, alumnoId, ...data }, include: { alumno: { include: { usuario: { select: { idUsuario: true, apellidoNombre: true, email: true, dni: true } } } }, mesa: { include: { materia: true } } } });
      const version = await this.bumpMesaVersion(tx, mesaId);
      return { ...inscription, version };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async desinscribirAlumno(mesaId: number, alumnoId: number, expectedVersion?: number): Promise<any> {
    return await prisma.$transaction(async tx => {
      await this.lockMesa(tx, mesaId);
      const mesa = await tx.mesa.findUnique({ where: { id: mesaId } });
      if (!mesa) throw new AppError(404, 'Examen no encontrado');
      this.assertVersion(mesa.version, expectedVersion);
      this.assertMutacionNominaPermitida(mesa);
      const inscription = await tx.inscripcionExamen.findFirst({ where: { mesaId, alumnoId, fechaBaja: null } });
      if (!inscription) throw new AppError(404, 'Inscripción no encontrada');
      const updated = await tx.inscripcionExamen.update({ where: { id: inscription.id }, data: { fechaBaja: new Date() } });
      const version = await this.bumpMesaVersion(tx, mesaId);
      return { ...updated, version };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async getInscriptosByExamen(mesaId: number): Promise<any[]> {
    return await prisma.inscripcionExamen.findMany({
      where: {
        mesaId,
        fechaBaja: null
      },
      include: {
        alumno: {
          include: {
            usuario: {
              select: {
                idUsuario: true,
                apellidoNombre: true,
                email: true,
                dni: true
              }
            }
          }
        },
        mesa: {
          select: {
            estadoMesa: true,
            publicadaEn: true,
            version: true,
            materia: { select: { notaMinima: true } }
          }
        }
      }
    });
  }

  async getInscripcionesByAlumno(alumnoId: number): Promise<any[]> {
    return await prisma.inscripcionExamen.findMany({
      where: {
        alumnoId,
        fechaBaja: null
      },
      include: {
        mesa: {
          include: {
            materia: true
          }
        }
      },
      orderBy: {
        fechaInscripcion: 'desc'
      }
    });
  }

  // ===== CALIFICACIONES =====
  async registrarNota(
    mesaId: number,
    alumnoId: number,
    nota: number | null,
    actor: ExamenActor,
    expectedVersion?: number,
    ausente = false,
    notaMinima = 6
  ): Promise<any> {
    return await prisma.$transaction(async tx => {
      await this.lockMesa(tx, mesaId);
      const mesa = await tx.mesa.findUnique({
        where: { id: mesaId },
        include: { materia: true, tribunales: true }
      });
      if (!mesa) throw new AppError(404, 'Examen no encontrado');
      this.assertActorPuedeEditarResultados(mesa.tribunales, actor);
      this.assertVersion(mesa.version, expectedVersion);
      if (mesa.estadoMesa === 'FINALIZADA') throw new AppError(409, 'Una mesa finalizada no admite resultados');
      if (!ausente && nota === null) throw new AppError(400, 'Debe enviar una nota o marcar ausente');
      const inscripcion = await tx.inscripcionExamen.findFirst({ where: { mesaId, alumnoId, fechaBaja: null } });
      if (!inscripcion) throw new AppError(404, 'Inscripción no encontrada');
      const anterior = { nota: inscripcion.notaBorrador, ausente: inscripcion.ausenteBorrador };
      const updated = await tx.inscripcionExamen.update({
        where: { id: inscripcion.id },
        data: {
          notaBorrador: ausente ? null : nota,
          ausenteBorrador: ausente
        },
        include: {
          alumno: { include: { usuario: { select: { idUsuario: true, apellidoNombre: true, email: true } } } }
        }
      });
      await tx.mesa.update({
        where: { id: mesaId },
        data: { estadoMesa: 'EN_PROCESO' }
      });
      const version = await this.bumpMesaVersion(tx, mesaId);
      await tx.mesaResultadoAuditoria.create({
        data: {
          mesaId,
          inscripcionId: inscripcion.id,
          actorId: actor.id,
          accion: 'CORRECCION',
          notaAnterior: anterior.nota,
          notaNueva: updated.notaBorrador,
          ausenteAnterior: anterior.ausente,
          ausenteNuevo: updated.ausenteBorrador
        }
      });
      return { ...updated, version, notaMinima: mesa.materia.notaMinima ?? notaMinima };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async cerrarMesa(mesaId: number, actor: ExamenActor, expectedVersion: number): Promise<any> {
    return await prisma.$transaction(async tx => {
      await this.lockMesa(tx, mesaId);
      const mesa = await tx.mesa.findUnique({
        where: { id: mesaId },
        include: { materia: true, tribunales: true, inscripciones: { where: { fechaBaja: null } } }
      });
      if (!mesa) throw new AppError(404, 'Examen no encontrado');
      this.assertActorPuedeEditarResultados(mesa.tribunales, actor, true);
      this.assertVersion(mesa.version, expectedVersion);
      if (mesa.estadoMesa === 'FINALIZADA') throw new AppError(409, 'La mesa ya está finalizada');
      this.assertTribunalCompleto(mesa.tribunales);
      const pendientes = mesa.inscripciones.filter(i => !i.ausenteBorrador && i.notaBorrador === null);
      if (pendientes.length > 0) throw new AppError(409, 'No se puede cerrar una mesa con resultados pendientes');
      const minimo = mesa.materia.notaMinima ?? 6;
      for (const inscripcion of mesa.inscripciones) {
        await tx.inscripcionExamen.update({
          where: { id: inscripcion.id },
          data: {
            notaFinal: inscripcion.ausenteBorrador ? null : inscripcion.notaBorrador,
            aprobado: !inscripcion.ausenteBorrador && inscripcion.notaBorrador !== null
              ? inscripcion.notaBorrador >= minimo
              : false,
            ausentePublicado: inscripcion.ausenteBorrador,
            notaBorrador: null,
            ausenteBorrador: false
          }
        });
      }
      const now = new Date();
      const updated = await tx.mesa.update({
        where: { id: mesaId },
        data: { estadoMesa: 'FINALIZADA', publicadaEn: now, version: { increment: 1 } }
      });
      await tx.mesaResultadoAuditoria.create({
        data: { mesaId, actorId: actor.id, accion: 'CIERRE', motivo: 'Publicación de resultados' }
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async reabrirMesa(mesaId: number, actorId: number, motivo: string, expectedVersion: number): Promise<any> {
    return await prisma.$transaction(async tx => {
      await this.lockMesa(tx, mesaId);
      const mesa = await tx.mesa.findUnique({
        where: { id: mesaId },
        include: { inscripciones: { where: { fechaBaja: null } } }
      });
      if (!mesa) throw new AppError(404, 'Examen no encontrado');
      this.assertVersion(mesa.version, expectedVersion);
      if (mesa.estadoMesa !== 'FINALIZADA') throw new AppError(409, 'Sólo se puede reabrir una mesa finalizada');
      for (const inscripcion of mesa.inscripciones) {
        await tx.inscripcionExamen.update({
          where: { id: inscripcion.id },
          data: {
            notaBorrador: inscripcion.ausentePublicado ? null : inscripcion.notaFinal,
            ausenteBorrador: inscripcion.ausentePublicado
          }
        });
      }
      const now = new Date();
      const updated = await tx.mesa.update({
        where: { id: mesaId },
        data: { estadoMesa: 'EN_PROCESO', reabiertaEn: now, reabiertaPor: actorId, motivoReapertura: motivo, version: { increment: 1 } }
      });
      await tx.mesaResultadoAuditoria.create({ data: { mesaId, actorId, accion: 'REAPERTURA', motivo } });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}

export default new ExamenRepository();
