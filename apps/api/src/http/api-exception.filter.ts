import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common'

interface HttpRequest {
  originalUrl: string
}

interface HttpResponse {
  status(code: number): { json(body: unknown): void }
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp()
    const request = context.getRequest<HttpRequest>()
    const response = context.getResponse<HttpResponse>()
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
    const message = this.message(exception, status)

    response.status(status).json({
      statusCode: status,
      error: HttpStatus[status] ?? 'Error',
      message,
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
    })
  }

  private message(exception: unknown, status: number): string {
    if (!(exception instanceof HttpException)) return 'Internal server error.'
    const body = exception.getResponse()
    if (typeof body === 'string') return body
    if (body && typeof body === 'object' && 'message' in body) {
      const value = (body as { message?: unknown }).message
      if (typeof value === 'string') return value
      if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string').join('; ')
    }
    return status === HttpStatus.TOO_MANY_REQUESTS ? 'Too many requests.' : 'Request failed.'
  }
}
