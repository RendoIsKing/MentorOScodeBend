import { v4 as uuid } from 'uuid';
import pinoHttp from 'pino-http';

export function withRequestId(req: any, _res: any, next: any) {
  req.id = req.id || uuid();
  next();
}

export const httpLogger = pinoHttp({ genReqId: (req: any) => req.id, autoLogging: { ignore: (req: any) => req.url?.includes('/health') } });


