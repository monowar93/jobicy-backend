// Auth module — JWT strategy, token service, and auth routes.
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from '@/auth/auth.controller';
import { AuthService } from '@/auth/auth.service';
import { AdminBootstrapService } from '@/auth/admin-bootstrap.service';
import { TokenService } from '@/auth/token.service';
import { JwtStrategy } from '@/auth/strategies/jwt.strategy';
import { EmailModule } from '@/email/email.module';
import { AppConfig } from '@/config/configuration';

@Module({
  imports: [
    EmailModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: config.get('jwt.accessSecret', { infer: true }),
        signOptions: {
          expiresIn: config.get('jwt.accessTtl', { infer: true }),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, JwtStrategy, AdminBootstrapService],
  exports: [TokenService],
})
export class AuthModule {}
