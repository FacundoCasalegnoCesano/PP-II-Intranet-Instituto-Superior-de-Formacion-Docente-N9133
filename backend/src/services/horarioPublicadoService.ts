import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import config from '../config/env.js';
import { ROLES } from '../constants/roles.js';
import horarioPublicadoRepository, { type DocumentoHorarioCreateData, type HorarioScope } from '../repositories/horarioPublicadoRepository.js';
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
    carreraId: documento.carreraId ?? null,
    cursoAnio: documento.cursoAnio ?? null,
    carrera: documento.carrera ?? null,
    tamanio: documento.tamanio,
    fechaPublicacion: documento.createdAt,
    vigente: Boolean(documento.publicacionVigente),
    publicadoPor: documento.publicador
      ? { id: documento.publicador.idUsuario, nombre: documento.publicador.apellidoNombre }
      : undefined
  };
}

function comoVigente(documento: any) {
  return { ...documento, publicacionVigente: { cicloLectivo: documento.cicloLectivo } };
}

export class HorarioPublicadoService {
  constructor(
    private readonly repository: RepositorioHorarioPublicado = horarioPublicadoRepository,
    private readonly almacenamiento: Almacenamiento = fs,
    private readonly storageDir: string = config.horariosStorageDir
  ) {}

  private scope(scope?: HorarioScope): HorarioScope {
    const carreraId = scope?.carreraId ?? null;
    const cursoAnio = scope?.cursoAnio ?? null;
    if (carreraId === null && cursoAnio !== null) throw new AppError(400, 'cursoAnio requiere carreraId');
    return { carreraId, cursoAnio };
  }

  private async validarAmbito(cicloLectivo: number, scope: HorarioScope, usuario: UsuarioActual): Promise<void> {
    if (scope.carreraId === null) return;
    const carrera = await this.repository.buscarCarrera(scope.carreraId!);
    if (!carrera || !carrera.activo) throw new AppError(400, 'La carrera no existe o está inactiva');
    const cursoAnio = scope.cursoAnio;
    if (cursoAnio != null && (!Number.isInteger(cursoAnio) || cursoAnio < 1 || cursoAnio > carrera.duracionAnios)) throw new AppError(400, 'El año de curso no pertenece a la carrera');
    if (usuario.rol !== ROLES.ADMINISTRATIVO && !(await this.repository.carreraElegible(cicloLectivo, scope.carreraId!, usuario))) {
      throw new AppError(403, 'No tienes permisos para consultar esta carrera');
    }
  }

  async listarOpciones(cicloLectivo: number, usuario: UsuarioActual) {
    const carreras = await this.repository.listarCarrerasElegibles(cicloLectivo, usuario);
    const generalDisponible = Boolean(await this.repository.buscarVigentePorAmbito(cicloLectivo, {}));
    return { carreras, generalDisponible };
  }

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

  async listarAnios(usuario: UsuarioActual) {
    const filas = await this.repository.listarAnios();
    const visibles: number[] = [];
    for (const fila of filas) {
      if (fila.carreraId == null || usuario.rol === ROLES.ADMINISTRATIVO || await this.repository.carreraElegible(fila.cicloLectivo, fila.carreraId, usuario)) {
        visibles.push(fila.cicloLectivo);
      }
    }
    return [...new Set(visibles)];
  }

  async obtenerActual(cicloLectivo: number | undefined, requestedScope: HorarioScope | undefined, usuario: UsuarioActual) {
    const scope = this.scope(requestedScope);
    if (scope.carreraId !== null) await this.validarAmbito(cicloLectivo ?? new Date().getFullYear(), scope, usuario);
    const publicacion = cicloLectivo === undefined
      ? scope.carreraId === null
        ? (await this.repository.buscarVigentePorAmbito(new Date().getFullYear(), scope)) ?? await this.repository.buscarUltimaVigentePorAmbito(scope)
        : await this.repository.buscarVigentePorAmbito(new Date().getFullYear(), scope)
      : await this.repository.buscarVigentePorAmbito(cicloLectivo, scope);

    if (!publicacion) {
      throw new AppError(404, 'No hay un horario publicado para el ciclo lectivo solicitado');
    }
    return aDocumentoPublico(publicacion.documento);
  }

  async obtenerHistorial(cicloLectivo: number, requestedScope: HorarioScope | undefined, usuario: UsuarioActual) {
    this.exigirAdministrativo(usuario);
    const scope = this.scope(requestedScope);
    await this.validarAmbito(cicloLectivo, scope, usuario);
    return (await this.repository.listarHistorial(cicloLectivo, scope)).map(aDocumentoPublico);
  }

  async obtenerArchivo(id: number, usuario: UsuarioActual) {
    const documento = await this.repository.buscarPorId(id);
    if (!documento) {
      throw new AppError(404, 'Documento de horario no encontrado');
    }
    if (documento.carreraId != null) {
      await this.validarAmbito(documento.cicloLectivo, { carreraId: documento.carreraId, cursoAnio: documento.cursoAnio }, usuario);
    }
    if (!documento.publicacionVigente && usuario.rol !== ROLES.ADMINISTRATIVO) {
      throw new AppError(403, 'Solo los administrativos pueden descargar versiones históricas');
    }
    return { documento: aDocumentoPublico(documento), ruta: await this.asegurarArchivoDisponible(documento.claveInterna) };
  }

  async publicarArchivo(
    datos: { cicloLectivo: number; titulo?: string; carreraId?: number; cursoAnio?: number },
    archivo: ArchivoHorario | undefined,
    usuario: UsuarioActual
  ) {
    this.exigirAdministrativo(usuario);
    if (datos.cursoAnio != null) throw new AppError(400, 'Las nuevas publicaciones son por carrera; cursoAnio sólo aplica a históricos');
    const scope = this.scope(datos);
    if (scope.carreraId === null) throw new AppError(400, 'Las nuevas publicaciones requieren carreraId');
    await this.validarAmbito(datos.cicloLectivo, scope, usuario);
    validarArchivoHorario(archivo);
    const sha256 = crypto.createHash('sha256').update(archivo.buffer).digest('hex');
    const existente = await this.repository.buscarPorCicloYHash(datos.cicloLectivo, sha256, scope);

    if (existente) {
      await this.asegurarArchivoDisponible(existente.claveInterna);
      await this.repository.publicarExistente(existente);
      return { documento: aDocumentoPublico(comoVigente(existente)), reutilizado: true };
    }

    const claveInterna = crypto.randomUUID();
    const ruta = this.rutaArchivo(claveInterna);
    const titulo = datos.titulo?.trim() || path.basename(archivo.originalname, path.extname(archivo.originalname));
    const documento: DocumentoHorarioCreateData = {
      cicloLectivo: datos.cicloLectivo,
      carreraId: scope.carreraId,
      cursoAnio: scope.cursoAnio,
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
        documento: aDocumentoPublico(comoVigente(creado)),
        reutilizado: false
      };
    } catch (error) {
      await this.eliminarSilenciosamente(ruta);
      // La restricción única cicloLectivo+sha256 también cubre dos cargas iguales
      // concurrentes: la que perdió la carrera restaura la versión ya persistida.
      if ((error as { code?: string })?.code === 'P2002') {
        const existenteEnCarrera = await this.repository.buscarPorCicloYHash(datos.cicloLectivo, sha256, scope);
        if (existenteEnCarrera) {
          await this.asegurarArchivoDisponible(existenteEnCarrera.claveInterna);
          await this.repository.publicarExistente(existenteEnCarrera);
          return { documento: aDocumentoPublico(comoVigente(existenteEnCarrera)), reutilizado: true };
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
    if (documento.carreraId != null) {
      await this.validarAmbito(documento.cicloLectivo, { carreraId: documento.carreraId, cursoAnio: documento.cursoAnio }, usuario);
    }
    await this.asegurarArchivoDisponible(documento.claveInterna);
    await this.repository.publicarExistente(documento);
    return aDocumentoPublico(comoVigente(documento));
  }
}

export default new HorarioPublicadoService();
