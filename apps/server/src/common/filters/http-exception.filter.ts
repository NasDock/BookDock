import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'Internal Server Error';
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const errResponse = exception.getResponse();
      if (typeof errResponse === 'string') {
        message = errResponse;
      } else if (typeof errResponse === 'object') {
        const e = errResponse as Record<string, unknown>;
        message = (e.message as string) || message;
        error = (e.error as string) || error;
        details = e.details;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`Unhandled error: ${exception.message}`, exception.stack);
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      details,
      timestamp: new Date().toISOString(),
    });
  }
}
