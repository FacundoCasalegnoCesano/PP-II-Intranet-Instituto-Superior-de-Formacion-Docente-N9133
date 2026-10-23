import Joi from 'joi';

const POSITIVE_ID = Joi.number().integer().min(1);

function isCivilDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year = 0, month = 0, day = 0] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const civilDate = Joi.string().custom((value, helpers) => (
  isCivilDate(value) ? value : helpers.error('date.invalid')
)).messages({
  'date.invalid': 'La fecha debe ser un día calendario válido en formato YYYY-MM-DD'
});

export const listHistoricalExamsSchema = Joi.object({
  alumnoId: POSITIVE_ID,
  carreraId: POSITIVE_ID,
  materiaId: POSITIVE_ID,
  cursadaId: POSITIVE_ID,
  cicloLectivo: Joi.number().integer().min(1).max(9999)
}).unknown(false);

export const createHistoricalExamSchema = Joi.object({
  alumnoId: POSITIVE_ID.required(),
  cursadaId: POSITIVE_ID.required(),
  materiaId: POSITIVE_ID,
  cicloLectivo: Joi.number().integer().min(1).max(9999),
  fechaExamen: civilDate.required(),
  notaFinal: Joi.number().integer().min(0).max(10).required(),
  libro: Joi.string().max(255).allow('', null),
  folio: Joi.string().max(255).allow('', null)
}).unknown(false);

export const historicalExamIdSchema = Joi.object({
  id: POSITIVE_ID.required()
}).unknown(false);

export const updateHistoricalExamSchema = Joi.object({
  notaFinal: Joi.number().integer().min(0).max(10).required(),
  libro: Joi.string().max(255).allow('', null).required(),
  folio: Joi.string().max(255).allow('', null).required(),
  motivo: Joi.string().trim().min(1).max(1000).required(),
  expectedVersion: Joi.number().integer().min(0).required()
}).unknown(false);
