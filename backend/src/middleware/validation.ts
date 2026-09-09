import type { Request, Response, NextFunction } from 'express';
import type { Schema } from 'joi';

interface ValidationOptions {
  stripUnknown?: boolean;
}

export const validationMiddleware = (
  schema: Schema,
  property: 'body' | 'query' | 'params' = 'body',
  options: ValidationOptions = {}
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: options.stripUnknown ?? true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path[0],
        message: detail.message
      }));

      res.status(400).json({
        success: false,
        message: 'Error de validación',
        errors
      });
      return;
    }

    req[property] = value;
    next();
  };
};
