import Joi from 'joi';

const alumnoUpdateSchema = Joi.object({
  domicilio: Joi.string().max(255),
  anioEgreso: Joi.number().integer().min(1900).max(2100),
  institucionProcedencia: Joi.string().max(255).allow('', null)
}).min(1);

const alumnoRoleSchema = Joi.object({
  domicilio: Joi.string().max(255).required(),
  anioEgreso: Joi.number().integer().min(1900).max(2100).required(),
  institucionProcedencia: Joi.string().max(255).allow('', null)
});

export const updateUserSchema = Joi.object({
  apellidoNombre: Joi.string()
    .max(255)
    .messages({
      'string.max': 'El nombre y apellido no puede exceder 255 caracteres'
    }),
  
  dni: Joi.string()
    .pattern(/^\d{7,8}$/)
    .messages({
      'string.pattern.base': 'El DNI debe tener entre 7 y 8 dígitos'
    }),
  
  email: Joi.string()
    .email()
    .max(255)
    .messages({
      'string.email': 'Formato de email inválido',
      'string.max': 'El email no puede exceder 255 caracteres'
    }),
  
  fechaNacimiento: Joi.date()
    .max('now')
    .messages({
      'date.max': 'La fecha de nacimiento no puede ser futura'
    }),
  
  telefono: Joi.string()
    .pattern(/^\d{10,11}$/)
    .messages({
      'string.pattern.base': 'El teléfono debe tener entre 10 y 11 dígitos'
    }),
  
  cuil: Joi.string()
    .pattern(/^\d{11}$/)
    .messages({
      'string.pattern.base': 'El CUIL debe tener 11 dígitos'
    }),
  
  contactoEmergencia: Joi.string()
    .max(255)
    .allow('', null),
  
  foto: Joi.string()
    .max(255)
    .allow('', null),
  
  alumno: alumnoUpdateSchema
});

// Perfil propio: los campos administrativos y la contraseña tienen endpoints
// específicos y no deben llegar a la actualización general del perfil.
export const updateOwnUserSchema = Joi.object({
  apellidoNombre: updateUserSchema.extract('apellidoNombre'),
  dni: updateUserSchema.extract('dni'),
  email: updateUserSchema.extract('email'),
  fechaNacimiento: updateUserSchema.extract('fechaNacimiento'),
  telefono: updateUserSchema.extract('telefono'),
  cuil: updateUserSchema.extract('cuil'),
  contactoEmergencia: updateUserSchema.extract('contactoEmergencia'),
  foto: updateUserSchema.extract('foto'),
  rol: Joi.forbidden(),
  activo: Joi.forbidden(),
  password: Joi.forbidden(),
  passwordHash: Joi.forbidden(),
  backupCodes: Joi.forbidden(),
  alumno: Joi.forbidden()
});

export const changeRoleSchema = Joi.object({
  rol: Joi.string()
    .valid('ALUMNO', 'ADMINISTRATIVO', 'PROFESOR')
    .required()
    .messages({
      'any.required': 'El nuevo rol es requerido',
      'any.only': 'Rol inválido. Debe ser ALUMNO, ADMINISTRATIVO o PROFESOR'
    }),
  alumno: Joi.when('rol', {
    is: 'ALUMNO',
    then: alumnoRoleSchema.optional(),
    otherwise: Joi.forbidden()
  })
});

export const toggleActiveSchema = Joi.object({
  active: Joi.boolean()
    .required()
    .messages({
      'any.required': 'El estado es requerido (true/false)',
      'boolean.base': 'El estado debe ser true o false'
    })
});

export const listUsersSchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .default(1),
  
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20),
  
  rol: Joi.string()
    .valid('ALUMNO', 'ADMINISTRATIVO', 'PROFESOR'),
  
  activo: Joi.string()
    .valid('true', 'false'),
  
  search: Joi.string()
    .max(100)
    .allow('', null)
});
