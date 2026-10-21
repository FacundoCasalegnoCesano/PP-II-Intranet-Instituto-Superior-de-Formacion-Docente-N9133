import Joi from 'joi';

const id = Joi.number().integer().min(1);
const nombre = Joi.string().trim().min(1).max(255);
const descripcion = Joi.string().allow('', null).max(5000);
const componentesIds = Joi.array().items(id).unique().required();
const prerequisite = Joi.object({
  materiaRequeridaId: id,
  espacioRequeridoId: id,
  aplicaCursado: Joi.boolean().required(),
  aplicaRendir: Joi.boolean().required()
}).oxor('materiaRequeridaId', 'espacioRequeridoId')
  .or('materiaRequeridaId', 'espacioRequeridoId')
  .custom((value, helpers) => value.aplicaCursado || value.aplicaRendir
    ? value
    : helpers.error('any.invalid'))
  .unknown(false);

export const spaceIdParamsSchema = Joi.object({ id: id.required() });
export const prerequisiteParamsSchema = Joi.object({ id: id.required(), correlatividadId: id.required() });

export const createEspacioCurricularSchema = Joi.object({
  nombre: nombre.required(),
  carreraId: id.required(),
  descripcion,
  componentesIds,
  correlatividades: Joi.array().items(prerequisite).unique((a, b) =>
    a.materiaRequeridaId === b.materiaRequeridaId && a.espacioRequeridoId === b.espacioRequeridoId
  ),
  revisarCorrelatividadesComponentes: Joi.boolean()
}).unknown(false);

export const updateEspacioCurricularSchema = Joi.object({
  nombre,
  descripcion,
  componentesIds: Joi.array().items(id).unique(),
  revisarCorrelatividadesComponentes: Joi.boolean()
}).min(1).unknown(false);

export const createEspacioCorrelatividadSchema = prerequisite;
