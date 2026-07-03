// Creates the default admin user once on server start if missing.
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Role } from '@/generated/prisma';
import { AppConfig } from '@/config/configuration';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class AdminBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    const seed = this.config.get('seed', { infer: true });
    const email = seed.adminEmail.toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      return;
    }

    const rounds = this.config.get('jwt.bcryptRounds', { infer: true });
    const password = await bcrypt.hash(seed.adminPassword, rounds);

    await this.prisma.user.create({
      data: {
        name: seed.adminName,
        email,
        password,
        role: Role.ADMIN,
        emailVerified: true,
        profile: { create: {} },
      },
    });

    this.logger.log(`Default admin created (${email})`);
  }
}
