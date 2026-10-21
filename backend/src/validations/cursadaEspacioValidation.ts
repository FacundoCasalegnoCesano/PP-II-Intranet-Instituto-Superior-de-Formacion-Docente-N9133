import Joi from 'joi';

const PERIODOS = ['ANUAL', 'PRIMER_CUATRIMESTRE', 'SEGUNDO_CUATRIMESTRE'];

const componenteSchema = Joi.object({
  materiaId: Joi.number().integer().min(1).required(),
  docenteId: Joi.number().integer().min(1).allow(null),
  periodo: Joi.string().valid(...PERIODOS)
});

export const crearCursadaEspacioSchema = Joi.object({
  espacioCurricularId: Joi.number().integer().min(1).required(),
  anioLectivo: Joi.number().integer().min(2000).max(2100).required(),
  periodo: Joi.string().valid(...PERIODOS).default('ANUAL'),
  componentes: Joi.array().items(componenteSchema).unique('materiaId').min(2).required()
});

export const actualizarCursadaEspacioSchema = Joi.object({
  activo: Joi.boolean(),
  componentes: Joi.array().items(Joi.object({
    materiaId: Joi.number().integer().min(1).required(),
    docenteId: Joi.number().integer().min(1).allow(null),
    periodo: Joi.string().valid(...PERIODOS)
  }).unknown(false)).unique('materiaId').min(1)
}).min(1);

export const listarCursadasEspacioSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  carreraId: Joi.number().integer().min(1),
  anioLectivo: Joi.number().integer().min(2000).max(2100),
  activo: Joi.boolean(),
  search: Joi.string().trim().max(255)
});

export const cursadaEspacioIdParamsSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});
