import Joi from 'joi';

export const listarPeriodosSchema = Joi.object({
  tipo: Joi.string().valid('MATERIA', 'EXAMEN'),
  activo: Joi.boolean(),
  cicloLectivo: Joi.number().integer().min(2000).max(2100),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
});

// RAM Art. 20a + decisión institucional: los períodos habilitan explícitamente
// su contenido. El administrativo crea el período seleccionando:
// - MATERIA: las materias (navegando por carrera y año)
// - EXAMEN: las mesas de examen que abrió para el llamado

export const crearPeriodoSchema = Joi.object({
  tipo: Joi.string().valid('MATERIA', 'EXAMEN').required().messages({
    'any.required': 'El tipo es requerido (MATERIA o EXAMEN)',
    'any.only': 'Tipo inválido. Debe ser MATERIA o EXAMEN'
  }),
  cicloLectivo: Joi.number()
    .integer()
    .min(2000)
    .max(2100)
    .required()
    .messages({
      'any.required': 'El ciclo lectivo es requerido (ej: 2026)',
      'number.base': 'El ciclo lectivo debe ser un número',
      'number.integer': 'El ciclo lectivo debe ser un número entero',
      'number.min': 'Ciclo lectivo inválido',
      'number.max': 'Ciclo lectivo inválido'
    }),
  fechaInicio: Joi.date().required().messages({
    'any.required': 'La fecha de inicio es requerida',
    'date.base': 'Fecha de inicio inválida'
  }),
  fechaFin: Joi.date().required().greater(Joi.ref('fechaInicio')).messages({
    'any.required': 'La fecha de fin es requerida',
    'date.base': 'Fecha de fin inválida',
    'date.greater': 'La fecha de fin debe ser posterior a la fecha de inicio'
  }),
  materiasIds: Joi.when('tipo', {
    is: 'MATERIA',
    then: Joi.array().items(Joi.number().integer().min(1)).unique().optional().messages({
      'array.unique': 'Hay materias duplicadas en la selección'
    }),
    otherwise: Joi.forbidden().messages({
      'any.forbidden': 'materiasIds solo aplica a períodos tipo MATERIA'
    })
  }),
  cursadasEspaciosIds: Joi.when('tipo', {
    is: 'MATERIA',
    then: Joi.array().items(Joi.number().integer().min(1)).unique().optional().messages({
      'array.unique': 'Hay cursadas de espacios duplicadas en la selección'
    }),
    otherwise: Joi.forbidden().messages({
      'any.forbidden': 'cursadasEspaciosIds solo aplica a períodos tipo MATERIA'
    })
  }),
  mesasIds: Joi.when('tipo', {
    is: 'EXAMEN',
    then: Joi.array().items(Joi.number().integer().min(1)).unique().required().min(1).messages({
      'any.required': 'Debe seleccionar al menos una mesa de examen para el período',
      'array.min': 'Debe seleccionar al menos una mesa de examen para el período',
      'array.unique': 'Hay mesas duplicadas en la selección'
    }),
    otherwise: Joi.forbidden().messages({
      'any.forbidden': 'mesasIds solo aplica a períodos tipo EXAMEN'
    })
  }),
  descripcion: Joi.string().max(255).allow('', null)
}).custom((value, helpers) => {
  if (value.tipo === 'MATERIA' && !value.materiasIds?.length && !value.cursadasEspaciosIds?.length) {
    return helpers.error('periodo.materiaSelectionRequired');
  }
  return value;
}).messages({ 'periodo.materiaSelectionRequired': 'Debe seleccionar al menos una materia o cursada de espacio para el período' });

export const actualizarPeriodoSchema = Joi.object({
  tipo: Joi.string().valid('MATERIA', 'EXAMEN'),
  cicloLectivo: Joi.number().integer().min(2000).max(2100),
  fechaInicio: Joi.date(),
  // fin > inicio se valida en el service (permite updates parciales)
  fechaFin: Joi.date(),
  // Si se envían, reemplazan la selección anterior del período
  materiasIds: Joi.array().items(Joi.number().integer().min(1)).unique(),
  cursadasEspaciosIds: Joi.array().items(Joi.number().integer().min(1)).unique(),
  mesasIds: Joi.array().items(Joi.number().integer().min(1)).unique().min(1),
  descripcion: Joi.string().max(255).allow('', null),
  activo: Joi.boolean()
}).custom((value, helpers) => {
  if (value.tipo === 'EXAMEN' && (value.materiasIds?.length || value.cursadasEspaciosIds?.length)) {
    return helpers.error('periodo.incompatibleSelection');
  }
  if (value.tipo === 'MATERIA' && value.mesasIds?.length) {
    return helpers.error('periodo.incompatibleSelection');
  }
  return value;
}).messages({ 'periodo.incompatibleSelection': 'La selección enviada no corresponde al tipo de período' });
