import Joi from 'joi';

const FECHA_CALENDARIO = /^\d{4}-\d{2}-\d{2}$/;

export function esFechaCalendario(value: string): boolean {
  if (!FECHA_CALENDARIO.test(value)) return false;
  const [anio = 0, mes = 0, dia = 0] = value.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia;
}

function validarFechaCalendario(value: string, helpers: Joi.CustomHelpers): string {
  if (!FECHA_CALENDARIO.test(value)) {
    return helpers.error('date.format') as never;
  }

  if (!esFechaCalendario(value)) {
    return helpers.error('date.invalid') as never;
  }

  return value;
}

const fechaSchema = Joi.string()
  .custom(validarFechaCalendario)
  .messages({
    'date.format': 'La fecha debe tener el formato YYYY-MM-DD',
    'date.invalid': 'La fecha no es un día calendario válido'
  });

const asistenciaSchema = Joi.object({
  alumnoId: Joi.number().integer().min(1).required(),
  presente: Joi.boolean().required(),
  justificado: Joi.boolean().default(false),
  observacion: Joi.string().allow('', null).max(5000)
}).custom((value, helpers) => {
  if (value.presente && value.justificado) {
    return helpers.error('any.invalid');
  }
  return value;
}, 'consistencia de asistencia').messages({
  'any.invalid': 'Una asistencia presente no puede estar justificada'
}).unknown(false);

export const claseParamsSchema = Joi.object({
  cursadaId: Joi.number().integer().min(1).required(),
  fecha: fechaSchema.required()
}).unknown(false);

export const claseCursadaParamsSchema = Joi.object({
  cursadaId: Joi.number().integer().min(1).required()
}).unknown(false);

export const claseWriteSchema = Joi.object({
  temaDesarrollado: Joi.string().trim().min(1).max(5000).required().messages({
    'string.empty': 'El tema desarrollado es requerido'
  }),
  asistencias: Joi.array().min(1).required().items(asistenciaSchema)
}).unknown(false);
