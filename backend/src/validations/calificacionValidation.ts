import Joi from 'joi';

// PROMOCION no se acepta como tipo de carga: la promoción es un estado
// derivado (notaPromocion + asistencia), no una instancia de evaluación.
// COLOQUIO se unifica con EXAMEN_FINAL (instancia integradora para promoción).
const TIPOS_CALIFICACION = [
  'PARCIAL',
  'RECUPERATORIO',
  'EXAMEN_FINAL',
  'TRABAJO_PRACTICO'
];

export const cargaCalificacionesSchema = Joi.object({
  cursadaId: Joi.number()
    .required()
    .integer()
    .min(1)
    .messages({
      'any.required': 'El ID de cursada es requerido',
      'number.base': 'El ID de cursada debe ser un número'
    }),

  calificaciones: Joi.array()
    .required()
    .min(1)
    .items(
      Joi.object({
        alumnoId: Joi.number()
          .required()
          .integer()
          .min(1)
          .messages({
            'any.required': 'El ID del alumno es requerido dentro de cada registro',
            'number.base': 'El ID del alumno debe ser un número'
          }),
        tipoCalificacion: Joi.string()
          .required()
          .valid(...TIPOS_CALIFICACION)
          .messages({
            'any.required': 'El tipo de calificación es requerido',
            'any.only': `Tipo inválido. Debe ser: ${TIPOS_CALIFICACION.join(', ')}`
          }),
        numero: Joi.number()
          .integer()
          .min(1)
          .max(99)
          .default(1)
          .messages({
            'number.integer': 'El número de instancia debe ser un entero',
            'number.min': 'El número de instancia debe ser mayor a 0'
          }),
        fechaEvaluacion: Joi.date()
          .iso()
          .when('tipoCalificacion', {
            is: 'PARCIAL',
            then: Joi.required(),
            otherwise: Joi.optional()
          })
          .messages({
            'any.required': 'La fecha de evaluacion es requerida para un PARCIAL',
            'date.base': 'La fecha de evaluacion debe ser valida',
            'date.format': 'La fecha de evaluacion debe tener formato ISO-8601'
          }),
        parcialOriginalId: Joi.number()
          .integer()
          .min(1)
          .when('tipoCalificacion', {
            is: 'RECUPERATORIO',
            then: Joi.required(),
            otherwise: Joi.forbidden()
          })
          .messages({
            'any.required': 'El parcial original es requerido para un RECUPERATORIO',
            'any.unknown': 'El parcial original solo corresponde a un RECUPERATORIO',
            'number.base': 'El ID del parcial original debe ser un numero'
          }),
        nota: Joi.number()
          .required()
          .integer()
          .min(0)
          .max(10)
          .messages({
            'any.required': 'La nota es requerida',
            'number.base': 'La nota debe ser un número',
            'number.integer': 'La nota debe ser un número entero',
            'number.min': 'La nota mínima es 0',
            'number.max': 'La nota máxima es 10'
          }),
        observacion: Joi.string().max(5000).allow('', null)
      }).unknown(false)
    )
    .messages({
      'array.min': 'Debe enviar al menos una calificación',
      'any.required': 'El array de calificaciones es requerido'
    })
});

export const listCalificacionesQuerySchema = Joi.object({
  tipo: Joi.string().valid(...TIPOS_CALIFICACION),
  alumnoId: Joi.number().integer().min(1)
});

export const cursadasDisponiblesQuerySchema = Joi.object({
  anioLectivo: Joi.number()
    .required()
    .integer()
    .min(2000)
    .max(2100)
    .messages({
      'any.required': 'El año lectivo es requerido',
      'number.base': 'El año lectivo debe ser un número',
      'number.integer': 'El año lectivo debe ser un número entero',
      'number.min': 'El año lectivo debe ser mayor o igual a 2000',
      'number.max': 'El año lectivo debe ser menor o igual a 2100'
    })
});
