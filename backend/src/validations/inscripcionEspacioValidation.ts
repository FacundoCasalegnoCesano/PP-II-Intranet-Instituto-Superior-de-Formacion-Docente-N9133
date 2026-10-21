import Joi from 'joi';

const MODALIDADES = ['PRESENCIAL', 'SEMIPRESENCIAL', 'LIBRE'];

export const inscribirEspacioSchema = Joi.object({
  cursadaEspacioId: Joi.number().integer().min(1).required(),
  alumnoId: Joi.number().integer().min(1),
  modalidadElegida: Joi.string().valid(...MODALIDADES)
});

export const cicloEspacioQuerySchema = Joi.object({
  cicloLectivo: Joi.number().integer().min(2000).max(2100).default(new Date().getFullYear()),
  alumnoId: Joi.number().integer().min(1)
});

export const verificarEspacioParamsSchema = Joi.object({
  cursadaEspacioId: Joi.number().integer().min(1).required()
});

export const matriculaEspacioParamsSchema = Joi.object({
  id: Joi.number().integer().min(1).required()
});
