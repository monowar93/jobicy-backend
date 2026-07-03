// Winston logger factory + Morgan HTTP middleware wired to Winston.
import { ConfigService } from '@nestjs/config';
import { utilities as nestWinstonUtilities } from 'nest-winston';
import * as winston from 'winston';
import morgan from 'morgan';
import { Request, Response } from 'express';
import { AppConfig } from '@/config/configuration';

/**
 * Creates the Winston logger instance used by NestJS and Morgan.
 */
export function createWinstonLogger(
  configService: ConfigService<AppConfig, true>,
): winston.Logger {  const nodeEnv = configService.get<string>('nodeEnv', 'development');
  const logLevel = configService.get<string>('logLevel', 'debug');

  const consoleFormat =
    nodeEnv === 'development'
      ? winston.format.combine(
          winston.format.timestamp(),
          winston.format.colorize(),
          nestWinstonUtilities.format.nestLike('Joblens', { prettyPrint: true }),
        )
      : winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
        );

  const transports: winston.transport[] = [
    new winston.transports.Console({ format: consoleFormat }),
  ];

  if (nodeEnv === 'production') {
    transports.push(
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
        ),
      }),
      new winston.transports.File({
        filename: 'logs/combined.log',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
        ),
      }),
    );
  }

  return winston.createLogger({
    level: logLevel,
    transports,
  });
}

/**
 * Morgan middleware that pipes HTTP access lines into Winston.
 */
export function createMorganMiddleware(logger: winston.Logger) {
  return morgan(':method :url :status :response-time ms', {
    stream: {
      write: (message: string) => {
        logger.info(message.trim(), { context: 'HTTP' });
      },
    },
    skip: (req: Request, res: Response) => res.statusCode < 400,
  });
}

/** Winston module async factory options. */
export const winstonModuleOptions = {
  inject: [ConfigService],
  useFactory: (configService: ConfigService<AppConfig, true>) =>
    createWinstonLogger(configService),
};