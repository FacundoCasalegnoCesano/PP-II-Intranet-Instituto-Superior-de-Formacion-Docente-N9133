import Joi from 'joi';

const CICLO_MINIMO = 2000;
const CICLO_MAXIMO = 2100;

export const cicloLectivoSchema = Joi.object({
  cicloLectivo: Joi.number().integer().min(CICLO_MINIMO).max(CICLO_MAXIMO).required().messages({
    'any.required': 'El ciclo lectivo es requerido',
    'number.base': 'El ciclo lectivo debe ser un número',
    'number.integer': 'El ciclo lectivo debe ser un número entero',
    'number.min': `El ciclo lectivo debe estar entre ${CICLO_MINIMO} y ${CICLO_MAXIMO}`,
    'number.max': `El ciclo lectivo debe estar entre ${CICLO_MINIMO} y ${CICLO_MAXIMO}`
  })
});

export const publicarHorarioSchema = cicloLectivoSchema.keys({
  titulo: Joi.string().trim().min(1).max(160).optional().messages({
    'string.empty': 'El título no puede estar vacío',
    'string.max': 'El título no puede superar los 160 caracteres'
  })
});

export const cicloLectivoQuerySchema = Joi.object({
  cicloLectivo: Joi.number().integer().min(CICLO_MINIMO).max(CICLO_MAXIMO).optional()
});

export const idDocumentoSchema = Joi.object({
  id: Joi.number().integer().min(1).required()
});
