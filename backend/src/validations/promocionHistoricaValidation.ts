import Joi from 'joi';

const id = Joi.number().integer().min(1);
function civilDate(value: string, helpers: Joi.CustomHelpers) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return helpers.error('date.format');
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year!, month! - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month! - 1 && parsed.getUTCDate() === day
    ? value : helpers.error('date.format');
}
const date = Joi.string().custom(civilDate).messages({ 'date.format': 'La fecha debe ser un día calendario válido en formato YYYY-MM-DD' });

export const listPromocionesHistoricasSchema = Joi.object({
  alumnoId: id, carreraId: id, materiaId: id, cicloLectivo: Joi.number().integer().min(1).max(9999), cursadaId: id
}).unknown(false);

export const createPromocionHistoricaSchema = Joi.object({
  alumnoId: id.required(), cursadaId: id.required(),
  notaFinal: Joi.number().integer().min(0).max(10).required(),
  fechaAcreditacion: date.required(), motivo: Joi.string().trim().max(1000).allow('')
}).unknown(false);

export const updatePromocionHistoricaSchema = Joi.object({
  notaFinal: Joi.number().integer().min(0).max(10).required(),
  fechaAcreditacion: date,
  motivo: Joi.string().trim().min(1).max(1000).required(),
  expectedVersion: Joi.number().integer().min(1).required()
}).unknown(false);

export const promocionHistoricaIdSchema = Joi.object({ id: id.required() }).unknown(false);
