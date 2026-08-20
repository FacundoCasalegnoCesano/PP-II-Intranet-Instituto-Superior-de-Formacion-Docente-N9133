import Joi from 'joi';

const PERIODOS = ['ANUAL', 'PRIMER_CUATRIMESTRE', 'SEGUNDO_CUATRIMESTRE'];

export const createCursadaSchema = Joi.object({
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
  anioLectivo: Joi.number()
    .required()
    .integer()
    .min(2000)
    .max(2100)
    .messages({
      'number.base': 'El año lectivo debe ser un número',
      'number.integer': 'El año lectivo debe ser un número entero',
      'number.min': 'El año lectivo debe ser mayor o igual a 2000',
      'number.max': 'El año lectivo debe ser menor o igual a 2100',
      'any.required': 'El año lectivo es requerido'
    }),
  periodo: Joi.string()
    .valid(...PERIODOS)
    .default('ANUAL')
    .messages({
      'any.only': `Período inválido. Debe ser: ${PERIODOS.join(', ')}`
    }),
  docenteId: Joi.number().integer().min(1).allow(null)
});

export const updateCursadaSchema = Joi.object({
  materiaId: Joi.number().integer().min(1),
  anioLectivo: Joi.number().integer().min(2000).max(2100),
  periodo: Joi.string()
    .valid(...PERIODOS)
    .messages({
      'any.only': `Período inválido. Debe ser: ${PERIODOS.join(', ')}`
    }),
  docenteId: Joi.number().integer().min(1).allow(null),
  activo: Joi.boolean()
});

export const listCursadasSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  anioLectivo: Joi.number().integer().min(2000).max(2100),
  materiaId: Joi.number().integer().min(1),
  docenteId: Joi.number().integer().min(1),
  activo: Joi.boolean()
});