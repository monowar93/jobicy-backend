// Root module — wires global config, logging, Prisma, Redis, auth, and guards.
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { WinstonModule } from 'nest-winston';
import { ALIAS_CHECK } from '@/alias-check';
import { AuthModule } from '@/auth/auth.module';
import { ApplicationsModule } from '@/applications/applications.module';
import { JobsModule } from '@/jobs/jobs.module';
import { SavedJobsModule } from '@/saved-jobs/saved-jobs.module';
import { GlobalExceptionFilter } from '@/common/filters/global-exception.filter';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { LoggingInterceptor } from '@/common/interceptors/logging.interceptor';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import configuration from '@/config/configuration';
import { validateEnv } from '@/config/env.validation';
import { winstonModuleOptions } from '@/logger/winston.config';
import { PrismaModule } from '@/prisma/prisma.module';
import { RedisModule } from '@/redis/redis.module';
import { AppController } from './app.controller';

void ALIAS_CHECK;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    WinstonModule.forRootAsync(winstonModuleOptions),
    PrismaModule,
    RedisModule,
    AuthModule,
    SavedJobsModule,
    ApplicationsModule,
    JobsModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
