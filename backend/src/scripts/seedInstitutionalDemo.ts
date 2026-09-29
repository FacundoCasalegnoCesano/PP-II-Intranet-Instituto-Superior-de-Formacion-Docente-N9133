import 'dotenv/config';
import crypto from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { hashPassword } from '../utils/bcrypt.js';

const prisma = new PrismaClient();
const YEAR = 2026;
const RUN_DATE = new Date('2026-09-23T12:00:00.000Z');
const CURRENT_PERIOD_START = new Date('2026-09-01T03:00:00.000Z');
const CURRENT_PERIOD_END = new Date('2026-09-24T02:59:59.000Z');
const FUTURE_PERIOD_START = new Date('2026-10-20T03:00:00.000Z');
const FUTURE_PERIOD_END = new Date('2026-11-06T02:59:59.000Z');

const careers = [
  { name: 'Profesorado Local de Matemática', subjects: [{ name: 'Análisis Matemático', year: 1 }, { name: 'Geometría Analítica', year: 1 }, { name: 'Probabilidad y Estadística', year: 2 }, { name: 'Física para la Enseñanza', year: 3 }, { name: 'Práctica Docente I', year: 3 }, { name: 'Didáctica de la Matemática', year: 4 }] },
  { name: 'Profesorado de Lengua', subjects: [{ name: 'Gramática y Sintaxis', year: 1 }, { name: 'Literatura Argentina', year: 1 }, { name: 'Lingüística General', year: 2 }, { name: 'Didáctica de la Lengua', year: 3 }, { name: 'Práctica Docente I', year: 3 }, { name: 'Taller de Escritura Académica', year: 4 }] },
  { name: 'Profesorado de Artes Visualesa', subjects: [{ name: 'Dibujo y Observación', year: 1 }, { name: 'Historia del Arte', year: 1 }, { name: 'Color y Composición', year: 2 }, { name: 'Lenguajes Visuales', year: 3 }, { name: 'Didáctica de las Artes Visuales', year: 3 }, { name: 'Taller de Práctica Artística', year: 4 }] }
] as const;

const students = [
  { name: 'Valentina Quiroga', dni: 41091001, email: 'valentina.quiroga@demo.isfd9133.edu.ar', career: careers[0].name, birth: '2002-04-18', phone: '3815551001', secretEnv: 'DEMO_VALENTINA_PASSWORD' },
  { name: 'Tomás Benítez', dni: 41091002, email: 'tomas.benitez@demo.isfd9133.edu.ar', career: careers[0].name, birth: '2001-11-07', phone: '3815551002' },
  { name: 'Agustina Ferreyra', dni: 41091003, email: 'agustina.ferreyra@demo.isfd9133.edu.ar', career: careers[0].name, birth: '2003-02-25', phone: '3815551003' },
  { name: 'Martina Sosa', dni: 41091004, email: 'martina.sosa@demo.isfd9133.edu.ar', career: careers[1].name, birth: '2002-06-12', phone: '3815551004' },
  { name: 'Nicolás Pereyra', dni: 41091005, email: 'nicolas.pereyra@demo.isfd9133.edu.ar', career: careers[1].name, birth: '2001-08-29', phone: '3815551005' },
  { name: 'Camila Acosta', dni: 41091006, email: 'camila.acosta@demo.isfd9133.edu.ar', career: careers[1].name, birth: '2003-01-16', phone: '3815551006' },
  { name: 'Sofía Navarro', dni: 41091007, email: 'sofia.navarro@demo.isfd9133.edu.ar', career: careers[2].name, birth: '2002-03-04', phone: '3815551007' },
  { name: 'Joaquín Méndez', dni: 41091008, email: 'joaquin.mendez@demo.isfd9133.edu.ar', career: careers[2].name, birth: '2001-12-21', phone: '3815551008' },
  { name: 'Julieta Ríos', dni: 41091009, email: 'julieta.rios@demo.isfd9133.edu.ar', career: careers[2].name, birth: '2003-05-30', phone: '3815551009' }
] as const;

const CLAUDIA = { name: 'Claudia Benítez', dni: 41091990, email: 'claudia.benitez@demo.isfd9133.edu.ar', birth: new Date('1984-09-14T00:00:00.000Z'), phone: '3815551990' } as const;

type UserSeed = { name: string; dni: number; email: string; birth: Date; phone: string; role: string; secretEnv?: string };

function assertLocalDatabase(): void {
  if ((process.env.NODE_ENV ?? '').toLowerCase() === 'production') throw new Error('Seed demo abortado: NODE_ENV=production');
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('Seed demo abortado: DATABASE_URL ausente');
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('Seed demo abortado: DATABASE_URL inválida'); }
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || databaseName !== 'instituto_db') throw new Error('Seed demo abortado: DATABASE_URL no apunta a localhost/127.0.0.1/instituto_db');
}

function randomPassword(): string { return `Demo-${crypto.randomBytes(18).toString('base64url')}9!`; }

function careerByName(name: string, rows: Array<{ id: number; nombre: string }>): { id: number; nombre: string } {
  const career = rows.find(row => row.nombre === name);
  if (!career) throw new Error(`No existe la carrera requerida: ${name}`);
  return career;
}

async function upsertUser(tx: Prisma.TransactionClient, data: UserSeed): Promise<{ idUsuario: number; created: boolean }> {
  const existing = await tx.usuario.findFirst({ where: { OR: [{ email: data.email }, { dni: data.dni }] } });
  if (existing && (existing.email !== data.email || existing.dni !== data.dni)) throw new Error(`Colisión de identidad demo para ${data.email} o DNI ${data.dni}`);
  if (existing) {
    const saved = await tx.usuario.update({ where: { idUsuario: existing.idUsuario }, data: { apellidoNombre: data.name, fechaNacimiento: data.birth, telefono: data.phone, rol: data.role, activo: true } });
    return { idUsuario: saved.idUsuario, created: false };
  }
  const password = data.secretEnv ? process.env[data.secretEnv] : randomPassword();
  if (!password) throw new Error(`Falta el secreto runtime ${data.secretEnv}`);
  const saved = await tx.usuario.create({ data: { apellidoNombre: data.name, dni: data.dni, email: data.email, fechaNacimiento: data.birth, telefono: data.phone, passwordHash: await hashPassword(password), rol: data.role, activo: true } });
  return { idUsuario: saved.idUsuario, created: true };
}

async function main(): Promise<void> {
  assertLocalDatabase();
  const result = await prisma.$transaction(async tx => {
    const careerRows = await tx.carrera.findMany({ where: { activo: true }, select: { id: true, nombre: true } });
    const selectedCareers = new Map(careers.map(career => [career.name, careerByName(career.name, careerRows)]));
    const existingProfessors = await tx.usuario.findMany({ where: { rol: { contains: 'PROFESOR' }, activo: true, email: { not: CLAUDIA.email } }, select: { idUsuario: true }, orderBy: { idUsuario: 'asc' }, take: 2 });
    if (existingProfessors.length < 2) throw new Error('Se requieren dos profesores existentes para distribuir cursadas y tribunales');

    const claudia = await upsertUser(tx, { ...CLAUDIA, role: 'PROFESOR', secretEnv: 'DEMO_CLAUDIA_PASSWORD' });
    const studentRows = new Map<string, { idUsuario: number; idAlumno: number; careerId: number }>();
    for (const student of students) {
      const account = await upsertUser(tx, { name: student.name, dni: student.dni, email: student.email, birth: new Date(`${student.birth}T00:00:00.000Z`), phone: student.phone, role: 'ALUMNO', secretEnv: 'secretEnv' in student ? student.secretEnv : undefined });
      const career = selectedCareers.get(student.career)!;
      const alumno = await tx.alumno.upsert({ where: { idCuenta: account.idUsuario }, update: { domicilio: 'Av. Belgrano 9133, San Miguel de Tucumán', anioEgreso: 2020 }, create: { idCuenta: account.idUsuario, domicilio: 'Av. Belgrano 9133, San Miguel de Tucumán', anioEgreso: 2020 } });
      await tx.inscripcionCarrera.upsert({ where: { usuarioId_carreraId: { usuarioId: account.idUsuario, carreraId: career.id } }, update: { cicloLectivo: YEAR, activo: true, fechaBaja: null }, create: { usuarioId: account.idUsuario, carreraId: career.id, cicloLectivo: YEAR, fechaInscripcion: RUN_DATE } });
      studentRows.set(student.email, { idUsuario: account.idUsuario, idAlumno: alumno.idAlumno, careerId: career.id });
    }

    const courses = new Map<string, number>();
    for (const career of careers) for (const year of [1, 2, 3, 4]) {
      const description = `${year}° Año - ${career.name}`;
      const course = await tx.curso.upsert({ where: { anio_descripcion: { anio: year, descripcion: description } }, update: { activo: true }, create: { anio: year, descripcion: description, activo: true } });
      courses.set(`${career.name}:${year}`, course.id);
    }

    const demoSubjects: Array<{ id: number; carreraId: number; careerName: string; name: string; year: number }> = [];
    for (const career of careers) {
      const careerRow = selectedCareers.get(career.name)!;
      for (const [index, definition] of career.subjects.entries()) {
        const subject = await tx.materia.upsert({
          where: { carreraId_nombre: { carreraId: careerRow.id, nombre: definition.name } },
          update: { activo: true, cursoId: courses.get(`${career.name}:${definition.year}`), cargaHoraria: index === 4 ? 128 : 96, modalidad: 'PRESENCIAL', periodo: 'ANUAL', regimen: 'REGULAR_PRESENCIAL_PROMOCION', notaMinima: 6, asistenciaRequerida: 75, tpRequeridos: 75, esPromocionable: index !== 4, notaPromocion: 8, aniosRegularidad: 3 },
          create: { carreraId: careerRow.id, nombre: definition.name, descripcion: `Espacio curricular demo de ${career.name}`, cursoId: courses.get(`${career.name}:${definition.year}`), cargaHoraria: index === 4 ? 128 : 96, modalidad: 'PRESENCIAL', periodo: 'ANUAL', regimen: 'REGULAR_PRESENCIAL_PROMOCION', notaMinima: 6, asistenciaRequerida: 75, tpRequeridos: 75, esPromocionable: index !== 4, notaPromocion: 8, aniosRegularidad: 3, activo: true }
        });
        demoSubjects.push({ id: subject.id, carreraId: careerRow.id, careerName: career.name, name: definition.name, year: definition.year });
      }
    }

    const claudiaSubjectIds = new Set<number>();
    for (const career of careers) demoSubjects.filter(subject => subject.careerName === career.name).slice(0, 2).forEach(subject => claudiaSubjectIds.add(subject.id));
    for (const [index, subject] of demoSubjects.entries()) {
      const teacherId = claudiaSubjectIds.has(subject.id) ? claudia.idUsuario : existingProfessors[index % existingProfessors.length]!.idUsuario;
      await tx.profesorMateria.upsert({ where: { profesorId_materiaId: { profesorId: teacherId, materiaId: subject.id } }, update: { activo: true, fechaBaja: null }, create: { profesorId: teacherId, materiaId: subject.id, fechaAsignacion: RUN_DATE, activo: true } });
      if (teacherId !== claudia.idUsuario) await tx.profesorMateria.updateMany({ where: { profesorId: claudia.idUsuario, materiaId: subject.id, activo: true }, data: { activo: false, fechaBaja: RUN_DATE } });
      await tx.cursada.upsert({ where: { materiaId_anioLectivo_periodo: { materiaId: subject.id, anioLectivo: YEAR, periodo: 'ANUAL' } }, update: { docenteId: teacherId, activo: true }, create: { materiaId: subject.id, anioLectivo: YEAR, periodo: 'ANUAL', docenteId: teacherId, activo: true } });
    }

    const cursadas = new Map<number, number>();
    for (const subject of demoSubjects) {
      const cursada = await tx.cursada.findUniqueOrThrow({ where: { materiaId_anioLectivo_periodo: { materiaId: subject.id, anioLectivo: YEAR, periodo: 'ANUAL' } } });
      cursadas.set(subject.id, cursada.id);
    }
    for (const student of students) {
      const row = studentRows.get(student.email)!;
      for (const subject of demoSubjects.filter(subject => subject.carreraId === row.careerId).slice(0, 3)) await tx.inscripcionMateria.upsert({ where: { alumnoId_materiaId_cicloLectivo: { alumnoId: row.idAlumno, materiaId: subject.id, cicloLectivo: YEAR } }, update: { cursadaId: cursadas.get(subject.id), estado: 'ACTIVA', modalidadElegida: 'PRESENCIAL', fechaBaja: null }, create: { alumnoId: row.idAlumno, materiaId: subject.id, cicloLectivo: YEAR, cursadaId: cursadas.get(subject.id), modalidadElegida: 'PRESENCIAL', estado: 'ACTIVA', fechaInscripcion: RUN_DATE } });
    }

    const period = async (descripcion: string, fechaInicio: Date, fechaFin: Date) => {
      const existing = await tx.periodoInscripcion.findFirst({ where: { tipo: 'EXAMEN', cicloLectivo: YEAR, descripcion } });
      const data = { tipo: 'EXAMEN' as const, cicloLectivo: YEAR, fechaInicio, fechaFin, descripcion, activo: true };
      return existing ? tx.periodoInscripcion.update({ where: { id: existing.id }, data }) : tx.periodoInscripcion.create({ data });
    };
    const currentPeriod = await period('Demo: inscripción a mesas de septiembre 2026', CURRENT_PERIOD_START, CURRENT_PERIOD_END);
    const futurePeriod = await period('Demo: inscripción a mesas de noviembre 2026', FUTURE_PERIOD_START, FUTURE_PERIOD_END);

    const demoSubject = (careerName: string, name: string) => demoSubjects.find(subject => subject.careerName === careerName && subject.name === name)!;
    const examSubjects = [
      { subject: demoSubject(careers[0].name, careers[0].subjects[0].name), date: new Date('2026-09-24T12:00:00.000Z'), period: currentPeriod },
      { subject: demoSubject(careers[0].name, careers[0].subjects[1].name), date: new Date('2026-09-25T12:00:00.000Z'), period: currentPeriod },
      { subject: demoSubject(careers[1].name, careers[1].subjects[0].name), date: new Date('2026-09-26T12:00:00.000Z'), period: currentPeriod },
      { subject: demoSubject(careers[2].name, careers[2].subjects[0].name), date: new Date('2026-09-27T12:00:00.000Z'), period: currentPeriod },
      { subject: demoSubject(careers[1].name, careers[1].subjects[1].name), date: new Date('2026-11-06T12:00:00.000Z'), period: futurePeriod },
      { subject: demoSubject(careers[2].name, careers[2].subjects[1].name), date: new Date('2026-11-07T12:00:00.000Z'), period: futurePeriod }
    ];
    const seedMesaIds: number[] = [];
    for (const [index, exam] of examSubjects.entries()) {
      const dayStart = new Date(exam.date);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
      const matches = await tx.mesa.findMany({ where: { materiaId: { in: demoSubjects.map(subject => subject.id) }, fecha: { gte: dayStart, lt: dayEnd }, llamado: 1 }, orderBy: { createdAt: 'asc' }, select: { id: true } });
      const existing = matches[0];
      for (const duplicate of matches.slice(1)) {
        await tx.periodoMesaHabilitada.deleteMany({ where: { mesaId: duplicate.id } });
        await tx.inscripcionExamen.deleteMany({ where: { mesaId: duplicate.id } });
        await tx.mesaTribunal.deleteMany({ where: { mesaId: duplicate.id } });
        await tx.mesaResultadoAuditoria.deleteMany({ where: { mesaId: duplicate.id } });
        await tx.mesa.delete({ where: { id: duplicate.id } });
      }
      const mesa = existing
        ? await tx.mesa.update({ where: { id: existing.id }, data: { materiaId: exam.subject.id, fecha: exam.date, tipoExamen: index % 2 === 0 ? 'ORAL' : 'ESCRITO', estadoMesa: index < 4 ? 'EN_PROCESO' : 'ABIERTA', activo: true } })
        : await tx.mesa.create({ data: { materiaId: exam.subject.id, fecha: exam.date, tipoExamen: index % 2 === 0 ? 'ORAL' : 'ESCRITO', llamado: 1, estadoMesa: index < 4 ? 'EN_PROCESO' : 'ABIERTA', activo: true } });
      seedMesaIds.push(mesa.id);
      await tx.periodoMesaHabilitada.deleteMany({ where: { mesaId: mesa.id } });
      if (index < 4) await tx.inscripcionExamen.deleteMany({ where: { mesaId: mesa.id } });
      const tribunalIds = [claudia.idUsuario, ...existingProfessors.map(professor => professor.idUsuario)];
      await tx.mesaTribunal.deleteMany({ where: { mesaId: mesa.id, profesorId: { notIn: tribunalIds } } });
      await tx.mesaTribunal.upsert({ where: { mesaId_profesorId: { mesaId: mesa.id, profesorId: claudia.idUsuario } }, update: { rolTribunal: 'PRESIDENTE' }, create: { mesaId: mesa.id, profesorId: claudia.idUsuario, rolTribunal: 'PRESIDENTE' } });
      for (const professor of existingProfessors) await tx.mesaTribunal.upsert({ where: { mesaId_profesorId: { mesaId: mesa.id, profesorId: professor.idUsuario } }, update: { rolTribunal: 'VOCAL' }, create: { mesaId: mesa.id, profesorId: professor.idUsuario, rolTribunal: 'VOCAL' } });
      await tx.periodoMesaHabilitada.upsert({ where: { periodoInscripcionId_mesaId: { periodoInscripcionId: exam.period.id, mesaId: mesa.id } }, update: {}, create: { periodoInscripcionId: exam.period.id, mesaId: mesa.id } });
      if (index < 4) for (const student of students.filter(student => studentRows.get(student.email)!.careerId === exam.subject.carreraId).slice(0, 3)) {
        const row = studentRows.get(student.email)!;
        await tx.inscripcionExamen.upsert({ where: { mesaId_alumnoId: { mesaId: mesa.id, alumnoId: row.idAlumno } }, update: { fechaBaja: null, condicion: 'REGULAR', notaFinal: null, notaBorrador: null, ausenteBorrador: false, ausentePublicado: false, aprobado: false }, create: { mesaId: mesa.id, alumnoId: row.idAlumno, fechaInscripcion: RUN_DATE, condicion: 'REGULAR', notaFinal: null, notaBorrador: null, ausenteBorrador: false, ausentePublicado: false, aprobado: false } });
      }
    }
    await tx.periodoMesaHabilitada.deleteMany({ where: { periodoInscripcionId: currentPeriod.id, mesaId: { notIn: seedMesaIds.slice(0, 4) } } });
    await tx.periodoMesaHabilitada.deleteMany({ where: { periodoInscripcionId: futurePeriod.id, mesaId: { notIn: seedMesaIds.slice(4) } } });
    return { carreraCount: selectedCareers.size, cursos: careers.length * 4, subjectCount: demoSubjects.length, studentCount: students.length, claudiaActiveAssignments: claudiaSubjectIds.size, mesaSeptember: 4, mesaFuture: 2 };
  });
  console.log(JSON.stringify(result));
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Error desconocido en seed demo'); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
