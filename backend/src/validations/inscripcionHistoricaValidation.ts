import Joi from 'joi';

const id = Joi.number().integer().min(1);

export const inscripcionHistoricaParamsSchema = Joi.object({ id: id.required() }).unknown(false);
export const inscripcionHistoricaBodySchema = Joi.object({ alumnoId: id.required() }).unknown(false);
