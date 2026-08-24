import Joi from 'joi';

export const inscripcionCarreraSchema = Joi.object({
  // Opcional: los alumnos se inscriben a sí mismos (el controller usa su token);
  // el administrativo puede enviar alumnoId (id de cuenta).
  alumnoId: Joi.number()
    .integer()
    .min(1)
    .messages({
      'number.base': 'El ID del alumno debe ser un número',
      'number.integer': 'El ID del alumno debe ser un número entero',
      'number.min': 'El ID del alumno debe ser mayor a 0'
    }),
  carreraId: Joi.number()
    .required()
    .integer()
    .min(1)
    .messages({
      'any.required': 'El ID de la carrera es requerido',
      'number.base': 'El ID de la carrera debe ser un número',
      'number.integer': 'El ID de la carrera debe ser un número entero',
      'number.min': 'El ID de la carrera debe ser mayor a 0'
    }),
  cicloLectivo: Joi.number()
    .integer()
    .min(2000)
    .max(2100)
    .messages({
      'number.base': 'El ciclo lectivo debe ser un número',
      'number.integer': 'El ciclo lectivo debe ser un número entero',
      'number.min': 'El ciclo lectivo debe ser mayor o igual a 2000',
      'number.max': 'El ciclo lectivo no puede exceder 2100'
    })
});