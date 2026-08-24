import Joi from 'joi';

// La fecha de mesa debe ser ISO-8601 completo (ej: 2026-09-15T09:00:00.000Z)
// para evitar errores crudos de Prisma al llegar a la BD.
export const createExamenSchema = Joi.object({
  materiaId: Joi.number()
    .required()
    .integer()
    .min(1)
    .messages({
      'any.required': 'El ID de la materia es requerido',
      'number.base': 'El ID de la materia debe ser un número',
      'number.integer': 'El ID de la materia debe ser un número entero',
      'number.min': 'El ID de la materia debe ser mayor a 0'
    }),
  fecha: Joi.date()
    .iso()
    .required()
    .messages({
      'any.required': 'La fecha de la mesa es requerida',
      'date.base': 'La fecha debe ser una fecha válida',
      'date.isoDate':
        'La fecha debe tener formato ISO-8601 completo (ej: 2026-09-15T09:00:00.000Z)',
      'date.format': 'La fecha debe tener formato ISO-8601 (ej: 2026-09-15T09:00:00.000Z)'
    }),
  tipoExamen: Joi.string()
    .valid('ORAL', 'ESCRITO')
    .required()
    .messages({
      'any.required': 'El tipo de examen es requerido',
      'any.only': 'El tipo de examen debe ser ORAL o ESCRITO'
    }),
  llamado: Joi.number()
    .integer()
    .min(1)
    .max(3)
    .default(1)
    .messages({
      'number.base': 'El llamado debe ser un número',
      'number.integer': 'El llamado debe ser un número entero',
      'number.min': 'El llamado debe ser mayor o igual a 1',
      'number.max': 'El llamado no puede ser mayor a 3'
    }),
  folioExamen: Joi.string().max(255).allow('', null),
  libroExamen: Joi.string().max(255).allow('', null)
});

export const updateExamenSchema = Joi.object({
  fecha: Joi.date()
    .iso()
    .messages({
      'date.isoDate':
        'La fecha debe tener formato ISO-8601 completo (ej: 2026-09-15T09:00:00.000Z)',
      'date.format': 'La fecha debe tener formato ISO-8601 (ej: 2026-09-15T09:00:00.000Z)'
    }),
  tipoExamen: Joi.string().valid('ORAL', 'ESCRITO').messages({
    'any.only': 'El tipo de examen debe ser ORAL o ESCRITO'
  }),
  llamado: Joi.number().integer().min(1).max(3).messages({
    'number.integer': 'El llamado debe ser un número entero',
    'number.min': 'El llamado debe ser mayor o igual a 1',
    'number.max': 'El llamado no puede ser mayor a 3'
  }),
  estadoMesa: Joi.string().valid('ABIERTA', 'EN_PROCESO', 'FINALIZADA').messages({
    'any.only': "El estado de la mesa debe ser 'ABIERTA', 'EN_PROCESO' o 'FINALIZADA'"
  }),
  folioExamen: Joi.string().max(255).allow('', null),
  libroExamen: Joi.string().max(255).allow('', null)
}).min(1).messages({
  'object.min': 'Debe enviar al menos un campo para actualizar'
});

export const tribunalSchema = Joi.object({
  mesaId: Joi.number()
    .required()
    .integer()
    .min(1)
    .messages({
      'any.required': 'El ID de la mesa es requerido',
      'number.base': 'El ID de la mesa debe ser un número',
      'number.integer': 'El ID de la mesa debe ser un número entero',
      'number.min': 'El ID de la mesa debe ser mayor a 0'
    }),
  profesorId: Joi.number()
    .required()
    .integer()
    .min(1)
    .messages({
      'any.required': 'El ID del profesor es requerido',
      'number.base': 'El ID del profesor debe ser un número',
      'number.integer': 'El ID del profesor debe ser un número entero',
      'number.min': 'El ID del profesor debe ser mayor a 0'
    }),
  rolTribunal: Joi.string()
    .valid('PRESIDENTE', 'VOCAL', 'SUPLENTE')
    .default('VOCAL')
    .messages({
      'any.only': 'El rol del tribunal debe ser PRESIDENTE, VOCAL o SUPLENTE'
    })
});

export const inscripcionExamenSchema = Joi.object({
  // Opcional: los alumnos se inscriben a sí mismos (el controller usa su token);
  // el administrativo debe enviarlo.
  alumnoId: Joi.number()
    .integer()
    .min(1)
    .messages({
      'number.base': 'El ID del alumno debe ser un número',
      'number.integer': 'El ID del alumno debe ser un número entero',
      'number.min': 'El ID del alumno debe ser mayor a 0'
    }),
  condicion: Joi.string()
    .valid('REGULAR', 'LIBRE')
    .default('REGULAR')
    .messages({
      'any.only': "La condición debe ser 'REGULAR' o 'LIBRE'"
    })
});

export const notaExamenSchema = Joi.object({
  alumnoId: Joi.number()
    .required()
    .integer()
    .min(1)
    .messages({
      'any.required': 'El ID del alumno es requerido',
      'number.base': 'El ID del alumno debe ser un número',
      'number.integer': 'El ID del alumno debe ser un número entero',
      'number.min': 'El ID del alumno debe ser mayor a 0'
    }),
  nota: Joi.number()
    .required()
    .integer()
    .min(0)
    .max(10)
    .messages({
      'any.required': 'La nota final es requerida',
      'number.base': 'La nota debe ser un número',
      'number.integer': 'La nota debe ser un número entero',
      'number.min': 'La nota mínima es 0',
      'number.max': 'La nota máxima es 10'
    })
});
