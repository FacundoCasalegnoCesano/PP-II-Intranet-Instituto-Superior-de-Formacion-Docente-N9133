import Joi from 'joi';

export const registerSchema = Joi.object({
  apellidoNombre: Joi.string()
    .required()
    .max(255)
    .messages({
      'string.empty': 'El nombre y apellido es requerido',
      'string.max': 'El nombre y apellido no puede exceder 255 caracteres'
    }),
  
  dni: Joi.string()
    .required()
    .pattern(/^\d{7,8}$/)
    .messages({
      'string.empty': 'El DNI es requerido',
      'string.pattern.base': 'El DNI debe tener entre 7 y 8 dígitos'
    }),
  
  email: Joi.string()
    .required()
    .email()
    .max(255)
    .messages({
      'string.empty': 'El email es requerido',
      'string.email': 'Formato de email inválido',
      'string.max': 'El email no puede exceder 255 caracteres'
    }),
  
  fechaNacimiento: Joi.date()
    .required()
    .max('now')
    .messages({
      'date.base': 'Fecha de nacimiento inválida',
      'date.max': 'La fecha de nacimiento no puede ser futura'
    }),
  
  telefono: Joi.string()
    .required()
    .pattern(/^\d{10,11}$/)
    .messages({
      'string.empty': 'El teléfono es requerido',
      'string.pattern.base': 'El teléfono debe tener entre 10 y 11 dígitos'
    }),
  
  password: Joi.string()
    .required()
    .min(8)
    .max(50)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
    .messages({
      'string.empty': 'La contraseña es requerida',
      'string.min': 'La contraseña debe tener al menos 8 caracteres',
      'string.max': 'La contraseña no puede exceder 50 caracteres',
      'string.pattern.base': 'La contraseña debe tener al menos una mayúscula, una minúscula, un número y un carácter especial'
    }),
  
  cuil: Joi.string()
    .required()
    .pattern(/^\d{11}$/)
    .messages({
      'string.empty': 'El CUIL es requerido',
      'string.pattern.base': 'El CUIL debe tener 11 dígitos'
    }),
  
  rol: Joi.string()
    .valid('ALUMNO', 'ADMINISTRATIVO', 'PROFESOR')
    .required()
    .messages({
      'any.only': 'Rol inválido. Debe ser ALUMNO, ADMINISTRATIVO o PROFESOR'
    }),
  
  contactoEmergencia: Joi.string()
    .max(255)
    .allow('', null),
  
  foto: Joi.string()
    .max(255)
    .allow('', null)
});

export const loginSchema = Joi.object({
  identifier: Joi.string()
    .required()
    .messages({
      'string.empty': 'Email o DNI es requerido'
    }),
  
  password: Joi.string()
    .required()
    .messages({
      'string.empty': 'La contraseña es requerida'
    })
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string()
    .required()
    .messages({
      'string.empty': 'La contraseña actual es requerida'
    }),
  
  newPassword: Joi.string()
    .required()
    .min(8)
    .max(50)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
    .messages({
      'string.empty': 'La nueva contraseña es requerida',
      'string.min': 'La nueva contraseña debe tener al menos 8 caracteres',
      'string.max': 'La nueva contraseña no puede exceder 50 caracteres',
      'string.pattern.base': 'La contraseña debe tener al menos una mayúscula, una minúscula, un número y un carácter especial'
    })
});

export const forgotPasswordSchema = Joi.object({
  email: Joi.string()
    .required()
    .email()
    .messages({
      'string.empty': 'El email es requerido',
      'string.email': 'Formato de email inválido'
    })
});

export const resetPasswordSchema = Joi.object({
  token: Joi.string()
    .required()
    .messages({
      'string.empty': 'El token es requerido'
    }),
  
  newPassword: Joi.string()
    .required()
    .min(8)
    .max(50)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
    .messages({
      'string.empty': 'La nueva contraseña es requerida',
      'string.min': 'La nueva contraseña debe tener al menos 8 caracteres',
      'string.max': 'La nueva contraseña no puede exceder 50 caracteres',
      'string.pattern.base': 'La contraseña debe tener al menos una mayúscula, una minúscula, un número y un carácter especial'
    })
});