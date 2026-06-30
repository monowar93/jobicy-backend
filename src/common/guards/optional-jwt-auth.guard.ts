// Optional JWT guard — attaches req.user when a valid Bearer token is present; anon otherwise.
import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtPayload } from '@/common/types/authed-request.type';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  /**
   * Skip passport when no Bearer header — route proceeds as anonymous.
   * Invalid tokens are also treated as anonymous (no 401 on public routes).
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string } }>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return true;
    }

    try {
      return (await super.canActivate(context)) as boolean;
    } catch {
      return true;
    }
  }

  /** Invalid/expired tokens are treated as anonymous (no throw on public routes). */
  handleRequest<TUser = JwtPayload>(
    _err: Error | null,
    user: TUser | false,
  ): TUser | null {
    if (!user) {
      return null;
    }
    return user;
  }
}
