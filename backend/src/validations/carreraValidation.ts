import Joi from 'joi';

export const createCarreraSchema = Joi.object({
  nombre: Joi.string()
    .required()
    .max(255)
    .messages({
      'string.empty': 'El nombre de la carrera es requerido',
      'string.max': 'El nombre no puede exceder 255 caracteres'
    }),
  duracionAnios: Joi.number()
    .required()
    .integer()
    .min(1)
    .max(10)
    .messages({
      'number.base': 'La duración debe ser un número',
      'number.integer': 'La duración debe ser un número entero',
      'number.min': 'La duración mínima es 1 año',
      'number.max': 'La duración máxima es 10 años'
    })
});

export const updateCarreraSchema = Joi.object({
  nombre: Joi.string()
    .max(255)
    .messages({
      'string.max': 'El nombre no puede exceder 255 caracteres'
    }),
  duracionAnios: Joi.number()
    .integer()
    .min(1)
    .max(10)
    .messages({
      'number.integer': 'La duración debe ser un número entero',
      'number.min': 'La duración mínima es 1 año',
      'number.max': 'La duración máxima es 10 años'
    }),
  activo: Joi.boolean()
});

export const listCarrerasSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().allow('', null),
  activo: Joi.boolean()
});