import { prisma } from '../config/prisma.js';

export interface DocumentoHorarioCreateData {
  cicloLectivo: number;
  titulo: string;
  nombreOriginal: string;
  claveInterna: string;
  tamanio: number;
  sha256: string;
  publicadorId: number;
}

const includeDocumento = {
  publicador: { select: { idUsuario: true, apellidoNombre: true } },
  publicacionVigente: true
} as const;

class HorarioPublicadoRepository {
  async listarAnios(): Promise<any[]> {
    return prisma.publicacionHorario.findMany({
      select: { cicloLectivo: true },
      orderBy: { cicloLectivo: 'desc' }
    });
  }

  async buscarVigentePorCiclo(cicloLectivo: number): Promise<any> {
    return prisma.publicacionHorario.findUnique({
      where: { cicloLectivo },
      include: { documento: { include: includeDocumento } }
    });
  }

  async buscarUltimaVigente(): Promise<any> {
    return prisma.publicacionHorario.findFirst({
      orderBy: { cicloLectivo: 'desc' },
      include: { documento: { include: includeDocumento } }
    });
  }

  async buscarPorId(id: number): Promise<any> {
    return prisma.documentoHorario.findUnique({
      where: { id },
      include: includeDocumento
    });
  }

  async buscarPorCicloYHash(cicloLectivo: number, sha256: string): Promise<any> {
    return prisma.documentoHorario.findUnique({
      where: { cicloLectivo_sha256: { cicloLectivo, sha256 } },
      include: includeDocumento
    });
  }

  async listarHistorial(cicloLectivo: number): Promise<any[]> {
    return prisma.documentoHorario.findMany({
      where: { cicloLectivo },
      include: includeDocumento,
      orderBy: { createdAt: 'desc' }
    });
  }

  async crearYPublicar(data: DocumentoHorarioCreateData): Promise<any> {
    return prisma.$transaction(async (tx) => {
      const documento = await tx.documentoHorario.create({ data });
      await tx.publicacionHorario.upsert({
        where: { cicloLectivo: data.cicloLectivo },
        create: { cicloLectivo: data.cicloLectivo, documentoId: documento.id },
        update: { documentoId: documento.id }
      });
      return documento;
    });
  }

  async publicarExistente(documento: { id: number; cicloLectivo: number }): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.publicacionHorario.upsert({
        where: { cicloLectivo: documento.cicloLectivo },
        create: { cicloLectivo: documento.cicloLectivo, documentoId: documento.id },
        update: { documentoId: documento.id }
      });
    });
  }
}

export default new HorarioPublicadoRepository();
