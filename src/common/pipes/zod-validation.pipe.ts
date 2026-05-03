import { PipeTransform, HttpException, HttpStatus } from '@nestjs/common';
import { ZodSchema, ZodError } from 'zod';

export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      const fields = this.formatErrors(result.error);
      throw new HttpException(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data.',
            fields,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return result.data;
  }

  private formatErrors(error: ZodError): Record<string, string> {
    const fields: Record<string, string> = {};

    for (const issue of error.issues) {
      const path = issue.path.join('.') || 'unknown';
      fields[path] = issue.message;
    }

    return fields;
  }
}
