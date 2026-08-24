import Joi from 'joi';

const MODALIDADES = ['PRESENCIAL', 'SEMIPRESENCIAL', 'LIBRE'];

export const inscripcionMateriaSchema = Joi.object({
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
  cicloLectivo: Joi.number()
    .integer()
    .min(2000)
    .max(2100)
    .messages({
      'number.base': 'El ciclo lectivo debe ser un número',
      'number.integer': 'El ciclo lectivo debe ser un número entero',
      'number.min': 'El ciclo lectivo debe ser mayor o igual a 2000',
      'number.max': 'El ciclo lectivo no puede exceder 2100'
    }),
  modalidadElegida: Joi.string()
    .valid(...MODALIDADES)
    .messages({
      'any.only': `La modalidad debe ser: ${MODALIDADES.join(', ')}`
    }),
  cursadaId: Joi.number()
    .integer()
    .min(1)
    .allow(null)
    .messages({
      'number.base': 'El ID de la cursada debe ser un número',
      'number.integer': 'El ID de la cursada debe ser un número entero',
      'number.min': 'El ID de la cursada debe ser mayor a 0'
    })
});

export const cambiarModalidadSchema = Joi.object({
  modalidad: Joi.string()
    .valid(...MODALIDADES)
    .required()
    .messages({
      'any.required': 'La modalidad es requerida',
      'any.only': `La modalidad debe ser: ${MODALIDADES.join(', ')}`
    })
});