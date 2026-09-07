import Joi from 'joi';

const TIPOS_ESPACIO = ['MATERIA', 'SEMINARIO', 'TALLER', 'TALLER_PRACTICA'];
const MODALIDADES = ['PRESENCIAL', 'SEMIPRESENCIAL', 'LIBRE'];
const PERIODOS = ['ANUAL', 'PRIMER_CUATRIMESTRE', 'SEGUNDO_CUATRIMESTRE'];
const REGIMENES = [
  'REGULAR_PRESENCIAL_PROMOCION',
  'REGULAR_PRESENCIAL_SIN_PROMOCION',
  'REGULAR_SEMIPRESENCIAL',
  'LIBRE'
];

export const createMateriaSchema = Joi.object({
  nombre: Joi.string()
    .required()
    .max(255)
    .messages({
      'string.empty': 'El nombre de la materia es requerido',
      'string.max': 'El nombre no puede exceder 255 caracteres'
    }),
  descripcion: Joi.string().allow('', null),
  cargaHoraria: Joi.number()
    .required()
    .integer()
    .min(1)
    .max(9999)
    .messages({
      'number.base': 'La carga horaria debe ser un número',
      'number.integer': 'La carga horaria debe ser un número entero',
      'number.min': 'La carga horaria mínima es 1 hora',
      'number.max': 'La carga horaria máxima es 9999 horas'
    }),
  horasCatedra: Joi.string().max(50).allow('', null),
  tipoEspacio: Joi.string()
    .required()
    .valid(...TIPOS_ESPACIO)
    .messages({
      'any.only': `Tipo de espacio inválido. Debe ser: ${TIPOS_ESPACIO.join(', ')}`
    }),
  modalidad: Joi.string()
    .valid(...MODALIDADES)
    .default('PRESENCIAL'),
  periodo: Joi.string()
    .valid(...PERIODOS)
    .default('ANUAL'),
  regimen: Joi.string()
    .valid(...REGIMENES)
    .default('REGULAR_PRESENCIAL_SIN_PROMOCION'),
  notaMinima: Joi.number().min(0).max(10).default(6),
  asistenciaRequerida: Joi.number().min(0).max(100).default(75),
  tpRequeridos: Joi.number().min(0).max(100).default(75),
  esPromocionable: Joi.boolean().default(false),
  notaPromocion: Joi.number().min(0).max(10).default(8),
  // Si no se carga, el service lo calcula según tipoEspacio
  // (seminarios y talleres: 1 año, resto: 3). Valor explícito = prioridad.
  aniosRegularidad: Joi.number().integer().min(1).max(5),
  carreraId: Joi.number()
    .required()
    .integer()
    .min(1)
    .messages({
      'number.base': 'El ID de carrera debe ser un número',
      'number.integer': 'El ID de carrera debe ser un número entero',
      'number.min': 'El ID de carrera debe ser mayor a 0'
    }),
  cursoId: Joi.number()
    .required()
    .integer()
    .min(1)
    .messages({
      'any.required': 'El curso (año de la carrera) es requerido: 1° Año, 2° Año, etc.',
      'number.base': 'El ID de curso debe ser un número',
      'number.integer': 'El ID de curso debe ser un número entero',
      'number.min': 'El ID de curso debe ser mayor a 0'
    }),
  espacioCurricularId: Joi.number().integer().min(1).allow(null)
});

export const updateMateriaSchema = Joi.object({
  nombre: Joi.string().max(255),
  descripcion: Joi.string().allow('', null),
  cargaHoraria: Joi.number().integer().min(1).max(9999),
  horasCatedra: Joi.string().max(50).allow('', null),
  tipoEspacio: Joi.string().valid(...TIPOS_ESPACIO),
  modalidad: Joi.string().valid(...MODALIDADES),
  periodo: Joi.string().valid(...PERIODOS),
  regimen: Joi.string().valid(...REGIMENES),
  notaMinima: Joi.number().min(0).max(10),
  asistenciaRequerida: Joi.number().min(0).max(100),
  tpRequeridos: Joi.number().min(0).max(100),
  esPromocionable: Joi.boolean(),
  notaPromocion: Joi.number().min(0).max(10),
  aniosRegularidad: Joi.number().integer().min(1).max(5),
  carreraId: Joi.number().integer().min(1),
  cursoId: Joi.number().integer().min(1).allow(null),
  espacioCurricularId: Joi.number().integer().min(1).allow(null),
  activo: Joi.boolean()
});

export const listMateriasSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().allow('', null),
  carreraId: Joi.number().integer().min(1),
  tipoEspacio: Joi.string().valid(...TIPOS_ESPACIO),
  activo: Joi.boolean()
});

export const asignarProfesorSchema = Joi.object({
  profesorId: Joi.number()
    .required()
    .integer()
    .min(1)
    .messages({
      'number.base': 'El ID del profesor debe ser un número',
      'number.integer': 'El ID del profesor debe ser un número entero',
      'any.required': 'El ID del profesor es requerido'
    })
});

export const correlatividadSchema = Joi.object({
  materiaRequeridaId: Joi.number()
    .required()
    .integer()
    .min(1)
    .messages({
      'number.base': 'El ID de materia requerida debe ser un número',
      'number.integer': 'El ID de materia requerida debe ser un número entero'
    }),
  tipoRequisito: Joi.string()
    .required()
    .valid('OBLIGATORIA')
    .messages({
      'any.only': 'Tipo de requisito inválido. Debe ser OBLIGATORIA'
    }),
  aplicaCursado: Joi.boolean().default(true),
  aplicaRendir: Joi.boolean().default(true)
});
