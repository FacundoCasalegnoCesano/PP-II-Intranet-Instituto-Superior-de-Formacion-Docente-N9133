import Joi from 'joi';

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
  
  password: Joi.string()
    .min(8)
    .max(50)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
    .messages({
      'string.min': 'La contraseña debe tener al menos 8 caracteres',
      'string.max': 'La contraseña no puede exceder 50 caracteres',
      'string.pattern.base': 'La contraseña debe tener al menos una mayúscula, una minúscula, un número y un carácter especial'
    }),
  
  cuil: Joi.string()
    .pattern(/^\d{11}$/)
    .messages({
      'string.pattern.base': 'El CUIL debe tener 11 dígitos'
    }),
  
  rol: Joi.string()
    .valid('ALUMNO', 'ADMINISTRATIVO', 'PROFESOR')
    .messages({
      'any.only': 'Rol inválido. Debe ser ALUMNO, ADMINISTRATIVO o PROFESOR'
    }),
  
  contactoEmergencia: Joi.string()
    .max(255)
    .allow('', null),
  
  foto: Joi.string()
    .max(255)
    .allow('', null),
  
  activo: Joi.boolean()
});

export const changeRoleSchema = Joi.object({
  rol: Joi.string()
    .valid('ALUMNO', 'ADMINISTRATIVO', 'PROFESOR')
    .required()
    .messages({
      'any.required': 'El nuevo rol es requerido',
      'any.only': 'Rol inválido. Debe ser ALUMNO, ADMINISTRATIVO o PROFESOR'
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
