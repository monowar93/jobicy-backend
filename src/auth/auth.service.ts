// Auth business logic — register, login, token rotation, password reset, email verify.
import { randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { TokenType } from '@/generated/prisma';
import { appError } from '@/common/constants/error-codes';
import { AppConfig } from '@/config/configuration';
import { PrismaService } from '@/prisma/prisma.service';
import { EmailService } from '@/email/email.service';
import { TokenService } from '@/auth/token.service';
import { RegisterDto } from '@/auth/dto/register.dto';
import { LoginDto } from '@/auth/dto/login.dto';
import { ResetPasswordDto } from '@/auth/dto/reset-password.dto';
import { toUserDto, UserDto } from '@/auth/dto/user-response.dto';
import { expiresAtFromTtl } from '@/auth/utils/ttl.util';

/** Verification / reset tokens expire after 24 hours. */
const VERIFICATION_TOKEN_TTL = '24h';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Creates a user with an empty profile, sends a verification email (stub logs link).
   * Returns the safe user DTO without tokens.
   */
  async register(dto: RegisterDto): Promise<{ user: UserDto }> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existing) {
      throw appError('EMAIL_IN_USE');
    }

    const rounds = this.config.get('jwt.bcryptRounds', { infer: true });
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email: dto.email.toLowerCase(),
        password: passwordHash,
        profile: { create: {} },
      },
    });

    const verifyToken = await this.createVerificationToken(
      user.id,
      TokenType.EMAIL_VERIFY,
    );
    const link = this.buildFrontendLink(`/verify-email?token=${verifyToken}`);
    await this.emailService.sendVerifyEmail(user.email, link);

    return { user: toUserDto(user) };
  }

  /**
   * Validates credentials and issues tokens. Blocks login until email is verified.
   */
  async login(
    dto: LoginDto,
    userAgent?: string,
  ): Promise<{ user: UserDto; accessToken: string; refreshToken: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      throw appError('INVALID_CREDENTIALS');
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch) {
      throw appError('INVALID_CREDENTIALS');
    }

    if (!user.emailVerified) {
      throw appError('EMAIL_NOT_VERIFIED');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.tokenService.issuePair(user, userAgent);

    return {
      user: toUserDto(user),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  /** Rotates the refresh token and returns a new access token. */
  async refresh(
    rawRefreshToken: string,
    userAgent?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    if (!rawRefreshToken) {
      throw appError('UNAUTHORIZED', 'Refresh token missing');
    }

    const tokens = await this.tokenService.rotate(rawRefreshToken, userAgent);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  /** Revokes the refresh token in DB (idempotent if cookie already cleared). */
  async logout(rawRefreshToken?: string): Promise<{ success: true }> {
    if (rawRefreshToken) {
      await this.tokenService.revoke(rawRefreshToken);
    }
    return { success: true };
  }

  /**
   * Creates a password-reset token and emails the link.
   * Always succeeds to avoid revealing whether the email exists.
   */
  async forgotPassword(email: string): Promise<{ success: true }> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (user) {
      const resetToken = await this.createVerificationToken(
        user.id,
        TokenType.PASSWORD_RESET,
      );
      const link = this.buildFrontendLink(`/reset-password?token=${resetToken}`);
      await this.emailService.sendResetPassword(user.email, link);
    }

    return { success: true };
  }

  /**
   * Sets a new password from a valid reset token and revokes all refresh sessions.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<{ success: true }> {
    const tokenRow = await this.findValidToken(
      dto.token,
      TokenType.PASSWORD_RESET,
    );

    const rounds = this.config.get('jwt.bcryptRounds', { infer: true });
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: tokenRow.userId },
        data: { password: passwordHash },
      }),
      this.prisma.verificationToken.update({
        where: { id: tokenRow.id },
        data: { usedAt: new Date() },
      }),
    ]);

    await this.tokenService.revokeAllForUser(tokenRow.userId);

    return { success: true };
  }

  /** Marks the user's email as verified using a one-time EMAIL_VERIFY token. */
  async verifyEmail(token: string): Promise<{ success: true }> {
    const tokenRow = await this.findValidToken(token, TokenType.EMAIL_VERIFY);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: tokenRow.userId },
        data: { emailVerified: true },
      }),
      this.prisma.verificationToken.update({
        where: { id: tokenRow.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { success: true };
  }

  /** Returns the authenticated user's public profile. */
  async getMe(userId: string): Promise<{ user: UserDto }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw appError('USER_NOT_FOUND');
    }

    return { user: toUserDto(user) };
  }

  /** Creates a random hex verification token row and returns the raw token string. */
  private async createVerificationToken(
    userId: string,
    type: TokenType,
  ): Promise<string> {
    const token = randomBytes(32).toString('hex');

    await this.prisma.verificationToken.create({
      data: {
        userId,
        token,
        type,
        expiresAt: expiresAtFromTtl(VERIFICATION_TOKEN_TTL),
      },
    });

    return token;
  }

  /** Loads a token that exists, matches type, is unused, and not expired. */
  private async findValidToken(token: string, type: TokenType) {
    const tokenRow = await this.prisma.verificationToken.findUnique({
      where: { token },
    });

    if (
      !tokenRow ||
      tokenRow.type !== type ||
      tokenRow.usedAt !== null ||
      tokenRow.expiresAt < new Date()
    ) {
      throw appError('VALIDATION_ERROR', 'Invalid or expired token');
    }

    return tokenRow;
  }

  private buildFrontendLink(path: string): string {
    const origin = this.config.get('frontendOrigin', { infer: true });
    return `${origin}${path}`;
  }
}
