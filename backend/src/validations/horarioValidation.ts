import Joi from 'joi';

const DIAS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];

export const createHorarioSchema = Joi.object({
  cursadaId: Joi.number()
    .required()
    .integer()
    .min(1)
    .messages({
      'any.required': 'El ID de la cursada es requerido',
      'number.base': 'El ID de la cursada debe ser un número',
      'number.integer': 'El ID de la cursada debe ser un número entero',
      'number.min': 'El ID de la cursada debe ser mayor a 0'
    }),
  dia: Joi.string()
    .valid(...DIAS)
    .required()
    .messages({
      'any.required': 'El día es requerido',
      'any.only': `El día debe ser uno de: ${DIAS.join(', ')}`
    }),
  horaInicio: Joi.date()
    .iso()
    .required()
    .messages({
      'any.required': 'La hora de inicio es requerida',
      'date.base': 'La hora de inicio debe ser una fecha/hora válida',
      'date.isoDate': 'La hora de inicio debe tener formato ISO-8601 (ej: 2026-08-24T08:00:00.000Z)'
    }),
  horaFin: Joi.date()
    .iso()
    .required()
    .messages({
      'any.required': 'La hora de fin es requerida',
      'date.base': 'La hora de fin debe ser una fecha/hora válida',
      'date.isoDate': 'La hora de fin debe tener formato ISO-8601 (ej: 2026-08-24T10:00:00.000Z)'
    }),
  aula: Joi.string().max(50).allow('', null)
});

export const updateHorarioSchema = Joi.object({
  dia: Joi.string().valid(...DIAS).messages({
    'any.only': `El día debe ser uno de: ${DIAS.join(', ')}`
  }),
  horaInicio: Joi.date().iso().messages({
    'date.isoDate': 'La hora de inicio debe tener formato ISO-8601 (ej: 2026-08-24T08:00:00.000Z)'
  }),
  horaFin: Joi.date().iso().messages({
    'date.isoDate': 'La hora de fin debe tener formato ISO-8601 (ej: 2026-08-24T10:00:00.000Z)'
  }),
  aula: Joi.string().max(50).allow('', null),
  activo: Joi.boolean()
}).min(1).messages({
  'object.min': 'Debe enviar al menos un campo para actualizar'
});