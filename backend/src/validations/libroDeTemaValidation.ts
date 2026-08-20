import Joi from 'joi';

export const createLibroDeTemaSchema = Joi.object({
  materiaId: Joi.number()
    .required()
    .integer()
    .min(1)
    .messages({
      'number.base': 'El ID de materia debe ser un número',
      'number.integer': 'El ID de materia debe ser un número entero',
      'number.min': 'El ID de materia debe ser mayor a 0',
      'any.required': 'El ID de materia es requerido'
    }),
  fecha: Joi.date()
    .required()
    .messages({
      'date.base': 'La fecha debe ser una fecha válida (YYYY-MM-DD)',
      'any.required': 'La fecha es requerida'
    }),
  temaDesarrollado: Joi.string()
    .required()
    .trim()
    .min(1)
    .max(5000)
    .messages({
      'string.empty': 'El tema desarrollado es requerido',
      'string.max': 'El tema desarrollado no puede exceder 5000 caracteres'
    }),
  observaciones: Joi.string().allow('', null).max(5000)
});

export const updateLibroDeTemaSchema = Joi.object({
  fecha: Joi.date().messages({
    'date.base': 'La fecha debe ser una fecha válida (YYYY-MM-DD)'
  }),
  temaDesarrollado: Joi.string().trim().min(1).max(5000),
  observaciones: Joi.string().allow('', null).max(5000)
});

export const listLibroDeTemasSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  materiaId: Joi.number().integer().min(1),
  fechaDesde: Joi.date().messages({
    'date.base': 'fechaDesde debe ser una fecha válida (YYYY-MM-DD)'
  }),
  fechaHasta: Joi.date().messages({
    'date.base': 'fechaHasta debe ser una fecha válida (YYYY-MM-DD)'
  })
});