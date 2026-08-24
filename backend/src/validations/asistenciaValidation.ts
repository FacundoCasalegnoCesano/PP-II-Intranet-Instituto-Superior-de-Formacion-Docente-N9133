import Joi from 'joi';

export const cargaMasivaSchema = Joi.object({
  cursadaId: Joi.number()
    .required()
    .integer()
    .min(1)
    .messages({
      'any.required': 'El ID de cursada es requerido',
      'number.base': 'El ID de cursada debe ser un número'
    }),

  fecha: Joi.date()
    .required()
    .messages({
      'date.base': 'La fecha debe ser una fecha válida (YYYY-MM-DD)',
      'any.required': 'La fecha es requerida'
    }),

  asistencias: Joi.array()
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
        presente: Joi.boolean()
          .required()
          .messages({
            'any.required': 'El campo presente es requerido (true/false)',
            'boolean.base': 'El campo presente debe ser true o false'
          }),
        justificado: Joi.boolean().default(false),
        observacion: Joi.string().max(5000).allow('', null)
      }).unknown(false)
    )
    .messages({
      'array.min': 'Debe enviar al menos un registro de asistencia',
      'any.required': 'El array de asistencias es requerido'
    })
});

export const listAsistenciasQuerySchema = Joi.object({
  fecha: Joi.date().messages({
    'date.base': 'fecha debe ser una fecha válida (YYYY-MM-DD)'
  })
});