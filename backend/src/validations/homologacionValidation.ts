import Joi from 'joi';

export const listarHomologacionesSchema = Joi.object({
  estado: Joi.string().valid('PENDIENTE', 'APROBADA', 'RECHAZADA'),
  alumnoId: Joi.number().integer().min(1),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
});

export const crearHomologacionSchema = Joi.object({
  alumnoId: Joi.number()
    .integer()
    .min(1)
    .required()
    .messages({
      'any.required': 'El ID del alumno es requerido',
      'number.base': 'El ID del alumno debe ser un número',
      'number.integer': 'El ID del alumno debe ser un número entero',
      'number.min': 'El ID del alumno debe ser mayor a 0'
    }),
  materiaId: Joi.number()
    .integer()
    .min(1)
    .required()
    .messages({
      'any.required': 'El ID de la materia es requerido',
      'number.base': 'El ID de la materia debe ser un número',
      'number.integer': 'El ID de la materia debe ser un número entero',
      'number.min': 'El ID de la materia debe ser mayor a 0'
    }),
  tipoHomologacion: Joi.string()
    .valid('TOTAL', 'PARCIAL')
    .required()
    .messages({
      'any.required': 'El tipo de homologación es requerido',
      'any.only': 'El tipo debe ser TOTAL o PARCIAL'
    }),
  calificacion: Joi.number()
    .integer()
    .min(0)
    .max(10)
    .required()
    .messages({
      'any.required': 'La calificación es requerida',
      'number.base': 'La calificación debe ser un número',
      'number.integer': 'La calificación debe ser un número entero',
      'number.min': 'La calificación mínima es 0',
      'number.max': 'La calificación máxima es 10'
    }),
  observacion: Joi.string().max(2000).allow('', null)
});

export const resolverHomologacionSchema = Joi.object({
  accion: Joi.string()
    .valid('APROBAR', 'RECHAZAR')
    .required()
    .messages({
      'any.required': 'La acción es requerida (APROBAR o RECHAZAR)',
      'any.only': 'La acción debe ser APROBAR o RECHAZAR'
    })
});

export const notaComplementariaSchema = Joi.object({
  notaExamenHomologacion: Joi.number()
    .integer()
    .min(0)
    .max(10)
    .required()
    .messages({
      'any.required': 'La nota del examen complementario es requerida',
      'number.base': 'La nota debe ser un número',
      'number.integer': 'La nota debe ser un número entero',
      'number.min': 'La nota mínima es 0',
      'number.max': 'La nota máxima es 10'
    })
});
