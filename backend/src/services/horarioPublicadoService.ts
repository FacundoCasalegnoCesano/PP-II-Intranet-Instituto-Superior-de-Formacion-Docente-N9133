import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import config from '../config/env.js';
import { ROLES } from '../constants/roles.js';
import horarioPublicadoRepository, { type DocumentoHorarioCreateData } from '../repositories/horarioPublicadoRepository.js';
import { AppError } from '../utils/AppError.js';

export const MAX_ARCHIVO_HORARIO_BYTES = 10 * 1024 * 1024;

export interface ArchivoHorario {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface UsuarioActual {
  id: number;
  rol: string;
}

type RepositorioHorarioPublicado = typeof horarioPublicadoRepository;
type Almacenamiento = Pick<typeof fs, 'access' | 'mkdir' | 'unlink' | 'writeFile'>;

function nombrePdfSeguro(nombreOriginal: string): boolean {
  const base = path.basename(nombreOriginal);
  return /^[^.]+\.pdf$/i.test(base);
}

export function validarArchivoHorario(archivo: ArchivoHorario | undefined): asserts archivo is ArchivoHorario {
  if (!archivo || !Buffer.isBuffer(archivo.buffer)) {
    throw new AppError(400, 'Debe adjuntar un archivo PDF en el campo archivo');
  }
  if (archivo.size <= 0 || archivo.buffer.length === 0) {
    throw new AppError(400, 'El archivo PDF no puede estar vacío');
  }
  if (archivo.size > MAX_ARCHIVO_HORARIO_BYTES || archivo.buffer.length > MAX_ARCHIVO_HORARIO_BYTES) {
    throw new AppError(400, 'El archivo PDF supera el límite de 10 MB');
  }
  if (archivo.mimetype !== 'application/pdf') {
    throw new AppError(400, 'El tipo MIME del archivo debe ser application/pdf');
  }
  if (!nombrePdfSeguro(archivo.originalname)) {
    throw new AppError(400, 'El archivo debe tener una extensión simple .pdf');
  }
  if (archivo.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new AppError(400, 'El archivo no tiene una firma PDF válida');
  }
}

function aDocumentoPublico(documento: any) {
  return {
    id: documento.id,
    cicloLectivo: documento.cicloLectivo,
    titulo: documento.titulo,
    nombreOriginal: documento.nombreOriginal,
    tamanio: documento.tamanio,
    fechaPublicacion: documento.createdAt,
    vigente: Boolean(documento.publicacionVigente),
    publicadoPor: documento.publicador
      ? { id: documento.publicador.idUsuario, nombre: documento.publicador.apellidoNombre }
      : undefined
  };
}

export class HorarioPublicadoService {
  constructor(
    private readonly repository: RepositorioHorarioPublicado = horarioPublicadoRepository,
    private readonly almacenamiento: Almacenamiento = fs,
    private readonly storageDir: string = config.horariosStorageDir
  ) {}

  private exigirAdministrativo(usuario: UsuarioActual): void {
    if (usuario.rol !== ROLES.ADMINISTRATIVO) {
      throw new AppError(403, 'Solo los administrativos pueden gestionar horarios publicados');
    }
  }

  private rutaArchivo(claveInterna: string): string {
    return path.resolve(this.storageDir, `${claveInterna}.pdf`);
  }

  private async eliminarSilenciosamente(ruta: string): Promise<void> {
    try {
      await this.almacenamiento.unlink(ruta);
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        console.error('No se pudo limpiar un archivo temporal de horario publicado', { code: error?.code ?? 'FS_ERROR' });
      }
    }
  }

  private async asegurarArchivoDisponible(claveInterna: string): Promise<string> {
    const ruta = this.rutaArchivo(claveInterna);
    try {
      await this.almacenamiento.access(ruta);
      return ruta;
    } catch {
      throw new AppError(500, 'El archivo publicado no está disponible');
    }
  }

  async listarAnios() {
    return (await this.repository.listarAnios()).map(({ cicloLectivo }) => cicloLectivo);
  }

  async obtenerActual(cicloLectivo?: number) {
    const publicacion = cicloLectivo === undefined
      ? (await this.repository.buscarVigentePorCiclo(new Date().getFullYear())) ?? await this.repository.buscarUltimaVigente()
      : await this.repository.buscarVigentePorCiclo(cicloLectivo);

    if (!publicacion) {
      throw new AppError(404, 'No hay un horario publicado para el ciclo lectivo solicitado');
    }
    return aDocumentoPublico(publicacion.documento);
  }

  async obtenerHistorial(cicloLectivo: number, usuario: UsuarioActual) {
    this.exigirAdministrativo(usuario);
    return (await this.repository.listarHistorial(cicloLectivo)).map(aDocumentoPublico);
  }

  async obtenerArchivo(id: number, usuario: UsuarioActual) {
    const documento = await this.repository.buscarPorId(id);
    if (!documento) {
      throw new AppError(404, 'Documento de horario no encontrado');
    }
    if (!documento.publicacionVigente && usuario.rol !== ROLES.ADMINISTRATIVO) {
      throw new AppError(403, 'Solo los administrativos pueden descargar versiones históricas');
    }
    return { documento: aDocumentoPublico(documento), ruta: await this.asegurarArchivoDisponible(documento.claveInterna) };
  }

  async publicarArchivo(
    datos: { cicloLectivo: number; titulo?: string },
    archivo: ArchivoHorario | undefined,
    usuario: UsuarioActual
  ) {
    this.exigirAdministrativo(usuario);
    validarArchivoHorario(archivo);
    const sha256 = crypto.createHash('sha256').update(archivo.buffer).digest('hex');
    const existente = await this.repository.buscarPorCicloYHash(datos.cicloLectivo, sha256);

    if (existente) {
      await this.asegurarArchivoDisponible(existente.claveInterna);
      await this.repository.publicarExistente(existente);
      return { documento: aDocumentoPublico(existente), reutilizado: true };
    }

    const claveInterna = crypto.randomUUID();
    const ruta = this.rutaArchivo(claveInterna);
    const titulo = datos.titulo?.trim() || path.basename(archivo.originalname, path.extname(archivo.originalname));
    const documento: DocumentoHorarioCreateData = {
      cicloLectivo: datos.cicloLectivo,
      titulo,
      nombreOriginal: path.basename(archivo.originalname),
      claveInterna,
      tamanio: archivo.buffer.length,
      sha256,
      publicadorId: usuario.id
    };

    try {
      await this.almacenamiento.mkdir(this.storageDir, { recursive: true });
      await this.almacenamiento.writeFile(ruta, archivo.buffer, { flag: 'wx' });
      const creado = await this.repository.crearYPublicar(documento);
      return {
        documento: aDocumentoPublico({ ...creado, publicacionVigente: { cicloLectivo: datos.cicloLectivo } }),
        reutilizado: false
      };
    } catch (error) {
      await this.eliminarSilenciosamente(ruta);
      // La restricción única cicloLectivo+sha256 también cubre dos cargas iguales
      // concurrentes: la que perdió la carrera restaura la versión ya persistida.
      if ((error as { code?: string })?.code === 'P2002') {
        const existenteEnCarrera = await this.repository.buscarPorCicloYHash(datos.cicloLectivo, sha256);
        if (existenteEnCarrera) {
          await this.asegurarArchivoDisponible(existenteEnCarrera.claveInterna);
          await this.repository.publicarExistente(existenteEnCarrera);
          return { documento: aDocumentoPublico(existenteEnCarrera), reutilizado: true };
        }
      }
      throw error;
    }
  }

  async restaurar(id: number, usuario: UsuarioActual) {
    this.exigirAdministrativo(usuario);
    const documento = await this.repository.buscarPorId(id);
    if (!documento) {
      throw new AppError(404, 'Documento de horario no encontrado');
    }
    await this.asegurarArchivoDisponible(documento.claveInterna);
    await this.repository.publicarExistente(documento);
    return aDocumentoPublico(documento);
  }
}

export default new HorarioPublicadoService();
